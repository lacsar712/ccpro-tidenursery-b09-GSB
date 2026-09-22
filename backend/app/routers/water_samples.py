from typing import List, Optional

from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy import func
from sqlalchemy.orm import Session

from app.auth import get_current_user
from app.database import get_db
from app.models.pond import Pond
from app.models.user import User
from app.models.water_sample import DRAFT, PENDING, PUBLISHED, UPDATE_FIELDS, WaterSample
from app.schemas.water_sample import (
    PondDraftCount,
    WaterSampleCreate,
    WaterSampleOut,
    WaterSampleStatusAction,
    WaterSampleUpdate,
)

router = APIRouter(prefix="/api/water-samples", tags=["water-samples"])

STATUS_LABELS = {
    DRAFT: "草稿",
    PENDING: "待审",
    PUBLISHED: "已发布",
}
ACTION_LABELS = {
    "submit": "提交待审",
    "publish": "发布",
    "reject": "退回草稿",
}
# action: (合法源状态, 目标状态, 允许角色)
TRANSITIONS = {
    "submit": (DRAFT, PENDING, {"technician", "admin"}),
    "publish": (PENDING, PUBLISHED, {"admin"}),
    "reject": (PENDING, DRAFT, {"admin"}),
}
ROLE_LABELS = {"submit": "技术员", "publish": "场长", "reject": "场长"}


@router.get("", response_model=List[WaterSampleOut])
def list_samples(
    pond_id: Optional[int] = Query(None, alias="pondId"),
    status_filter: Optional[str] = Query(None, alias="status"),
    db: Session = Depends(get_db),
    _: User = Depends(get_current_user),
):
    # 默认列表只含已发布；带 status 参数可查草稿 / 待审 / 已发布
    q = db.query(WaterSample)
    if status_filter is None:
        q = q.filter(WaterSample.status == PUBLISHED)
    else:
        if status_filter not in STATUS_LABELS:
            raise HTTPException(
                status_code=400,
                detail="状态参数仅支持 draft / pending / published",
            )
        q = q.filter(WaterSample.status == status_filter)
    if pond_id is not None:
        q = q.filter(WaterSample.pond_id == pond_id)
    return q.order_by(WaterSample.sampled_at.desc()).all()


@router.get("/draft-counts", response_model=List[PondDraftCount])
def draft_counts(
    db: Session = Depends(get_db),
    _: User = Depends(get_current_user),
):
    """各塘口未发布（草稿）水质样数量，供塘口页提示。"""
    rows = (
        db.query(WaterSample.pond_id, func.count(WaterSample.id))
        .filter(WaterSample.status == DRAFT)
        .group_by(WaterSample.pond_id)
        .all()
    )
    return [{"pond_id": pid, "draft_count": cnt} for pid, cnt in rows]


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
        status=DRAFT,
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
    if item.status == PUBLISHED:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="已发布的水质样禁止修改测值",
        )
    data = payload.model_dump(exclude_unset=True)
    if "pond_id" in data:
        pond = db.query(Pond).filter(Pond.id == data["pond_id"]).first()
        if not pond:
            raise HTTPException(status_code=400, detail="塘口不存在")
    for k in UPDATE_FIELDS:
        if k in data:
            setattr(item, k, data[k])
    db.commit()
    db.refresh(item)
    return item


@router.patch("/{sample_id}/status", response_model=WaterSampleOut)
def change_status(
    sample_id: int,
    payload: WaterSampleStatusAction,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    item = db.query(WaterSample).filter(WaterSample.id == sample_id).first()
    if not item:
        raise HTTPException(status_code=404, detail="水质样不存在")

    from_status, to_status, allowed_roles = TRANSITIONS[payload.action]
    if current_user.role not in allowed_roles:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail=f"仅{ROLE_LABELS[payload.action]}可执行「{ACTION_LABELS[payload.action]}」操作",
        )
    if item.status != from_status:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail=(
                f"非法状态流转：当前为{STATUS_LABELS[item.status]}，"
                f"仅{STATUS_LABELS[from_status]}可{ACTION_LABELS[payload.action]}"
            ),
        )

    item.status = to_status
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
