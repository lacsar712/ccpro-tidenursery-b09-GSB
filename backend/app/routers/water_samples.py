from typing import List, Optional

from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy.orm import Session

from app.auth import get_current_user
from app.database import get_db
from app.models.pond import Pond
from app.models.user import User
from app.models.water_sample import WaterSample
from app.schemas.water_sample import (
    WaterSampleCreate,
    WaterSampleOut,
    WaterSampleStatusUpdate,
    WaterSampleUpdate,
)

router = APIRouter(prefix="/api/water-samples", tags=["water-samples"])

STATUS_LABELS = {
    "draft": "草稿",
    "pending": "待审",
    "published": "已发布",
}

# 合法跳转：(当前状态, 目标状态)
ALLOWED_TRANSITIONS = {
    ("draft", "pending"),       # 技术员提交待审
    ("pending", "published"),   # 场长发布
    ("pending", "draft"),       # 场长退回草稿
}

# 各跳转所需角色
TRANSITION_ROLES = {
    ("draft", "pending"): ("technician",),
    ("pending", "published"): ("admin",),
    ("pending", "draft"): ("admin",),
}

EDITABLE_STATUSES = ("draft", "pending")


@router.get("", response_model=List[WaterSampleOut])
def list_samples(
    pond_id: Optional[int] = Query(None, alias="pondId"),
    status_filter: Optional[str] = Query(None, alias="status"),
    db: Session = Depends(get_db),
    _: User = Depends(get_current_user),
):
    """默认只返回已发布；带 status 参数可查草稿 / 待审（status=all 返回全部）。"""
    q = db.query(WaterSample)
    if pond_id is not None:
        q = q.filter(WaterSample.pond_id == pond_id)

    if status_filter is None:
        q = q.filter(WaterSample.status == "published")
    elif status_filter != "all":
        names = {s.strip() for s in status_filter.split(",") if s.strip()}
        invalid = names - set(STATUS_LABELS)
        if invalid:
            raise HTTPException(status_code=400, detail="非法的状态参数")
        q = q.filter(WaterSample.status.in_(names))

    return q.order_by(WaterSample.sampled_at.desc()).all()


@router.post("", response_model=WaterSampleOut, status_code=status.HTTP_201_CREATED)
def create_sample(
    payload: WaterSampleCreate,
    db: Session = Depends(get_db),
    _: User = Depends(get_current_user),
):
    pond = db.query(Pond).filter(Pond.id == payload.pond_id).first()
    if not pond:
        raise HTTPException(status_code=400, detail="塘口不存在")
    item = WaterSample(
        pond_id=payload.pond_id,
        sampled_at=payload.sampled_at,
        temp_c=payload.temp_c,
        salinity_ppt=payload.salinity_ppt,
        do_mg_l=payload.do_mg_l,
        ph=payload.ph,
        notes=payload.notes,
        status="draft",  # 新建一律为草稿
    )
    db.add(item)
    db.commit()
    db.refresh(item)
    return item


@router.put("/{sample_id}", response_model=WaterSampleOut)
def update_sample(
    sample_id: int,
    payload: WaterSampleUpdate,
    db: Session = Depends(get_db),
    _: User = Depends(get_current_user),
):
    item = db.query(WaterSample).filter(WaterSample.id == sample_id).first()
    if not item:
        raise HTTPException(status_code=404, detail="水质样不存在")
    if item.status == "published":
        raise HTTPException(status_code=409, detail="已发布的水质样禁止修改测值字段")
    data = payload.model_dump(exclude_unset=True)
    for k, v in data.items():
        setattr(item, k, v)
    db.commit()
    db.refresh(item)
    return item


@router.patch("/{sample_id}/status", response_model=WaterSampleOut)
def change_status(
    sample_id: int,
    payload: WaterSampleStatusUpdate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    item = db.query(WaterSample).filter(WaterSample.id == sample_id).first()
    if not item:
        raise HTTPException(status_code=404, detail="水质样不存在")

    target = payload.status
    if item.status == target:
        raise HTTPException(
            status_code=409,
            detail=f"非法状态跳转：当前已是{STATUS_LABELS[target]}状态",
        )

    transition = (item.status, target)
    if transition not in ALLOWED_TRANSITIONS:
        raise HTTPException(
            status_code=409,
            detail=(
                f"非法状态跳转：{STATUS_LABELS[item.status]}"
                f"不能变更为{STATUS_LABELS[target]}"
            ),
        )

    allowed_roles = TRANSITION_ROLES[transition]
    if current_user.role not in allowed_roles:
        raise HTTPException(status_code=403, detail="无权执行该操作")

    item.status = target
    db.commit()
    db.refresh(item)
    return item


@router.delete("/{sample_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_sample(
    sample_id: int,
    db: Session = Depends(get_db),
    _: User = Depends(get_current_user),
):
    item = db.query(WaterSample).filter(WaterSample.id == sample_id).first()
    if not item:
        raise HTTPException(status_code=404, detail="水质样不存在")
    db.delete(item)
    db.commit()
