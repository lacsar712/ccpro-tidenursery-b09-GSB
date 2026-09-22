from datetime import datetime
from typing import Literal, Optional

from pydantic import BaseModel, ConfigDict, Field, field_validator

SampleStatus = Literal["draft", "pending", "published"]


class WaterSampleCreate(BaseModel):
    pond_id: int = Field(..., alias="pondId")
    sampled_at: datetime = Field(..., alias="sampledAt")
    temp_c: float = Field(..., alias="tempC")
    salinity_ppt: float = Field(..., alias="salinityPpt")
    do_mg_l: float = Field(..., alias="doMgL")
    ph: float
    notes: Optional[str] = None

    model_config = ConfigDict(populate_by_name=True)

    @field_validator("do_mg_l")
    @classmethod
    def validate_do(cls, v: float) -> float:
        if v <= 0:
            raise ValueError("溶解氧 doMgL 必须大于 0")
        return v

    @field_validator("ph")
    @classmethod
    def validate_ph(cls, v: float) -> float:
        if v < 6 or v > 9:
            raise ValueError("pH 必须在 6 到 9 之间")
        return v


class WaterSampleUpdate(BaseModel):
    """草稿 / 待审状态下可修改的内容字段（已发布禁止修改）。"""

    pond_id: Optional[int] = Field(None, alias="pondId")
    sampled_at: Optional[datetime] = Field(None, alias="sampledAt")
    temp_c: Optional[float] = Field(None, alias="tempC")
    salinity_ppt: Optional[float] = Field(None, alias="salinityPpt")
    do_mg_l: Optional[float] = Field(None, alias="doMgL")
    ph: Optional[float] = None
    notes: Optional[str] = None

    model_config = ConfigDict(populate_by_name=True)

    @field_validator("do_mg_l")
    @classmethod
    def validate_do(cls, v: Optional[float]) -> Optional[float]:
        if v is not None and v <= 0:
            raise ValueError("溶解氧 doMgL 必须大于 0")
        return v

    @field_validator("ph")
    @classmethod
    def validate_ph(cls, v: Optional[float]) -> Optional[float]:
        if v is not None and (v < 6 or v > 9):
            raise ValueError("pH 必须在 6 到 9 之间")
        return v


class WaterSampleStatusAction(BaseModel):
    """状态流转动作：submit 提交待审 / publish 发布 / reject 退回草稿。"""

    action: Literal["submit", "publish", "reject"]


class PondDraftCount(BaseModel):
    """单个塘口的未发布草稿数量。"""

    pond_id: int = Field(..., alias="pondId")
    draft_count: int = Field(..., alias="draftCount")

    model_config = ConfigDict(populate_by_name=True)


class WaterSampleOut(BaseModel):
    model_config = ConfigDict(from_attributes=True, populate_by_name=True)

    id: int
    pond_id: int = Field(serialization_alias="pondId")
    sampled_at: datetime = Field(serialization_alias="sampledAt")
    temp_c: float = Field(serialization_alias="tempC")
    salinity_ppt: float = Field(serialization_alias="salinityPpt")
    do_mg_l: float = Field(serialization_alias="doMgL")
    ph: float
    notes: Optional[str] = None
    status: SampleStatus = "draft"
