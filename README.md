# TideNursery-01 · 潮汐育苗台账

海水育苗场「塘口水质采样与投喂事件」台账种子项目（非库存 / 电商 / 医院）。

## 技术栈

| 层 | 技术 |
| --- | --- |
| 后端 | Python 3.11 · FastAPI · SQLAlchemy 2 · Pydantic v2 · python-jose · passlib(bcrypt) · uvicorn |
| 前端 | React 18 · Vite · TypeScript · React Router v6 |
| 数据库 | PostgreSQL 15 |
| 部署 | docker-compose · 前端 Nginx 反代 `/api` |

## 端口与账号

| 服务 | 端口 |
| --- | --- |
| 前端 | **3400** |
| 后端 API | **8400** |
| PostgreSQL | **5434** |

| 用户名 | 密码 | 角色 |
| --- | --- | --- |
| `admin` | `123456` | 场长 |
| `technician` | `123456` | 水质技术员 |

## 一键启动

```bash
cd TideNursery-01
docker compose up --build
```

启动后访问：

- 前端：http://localhost:3400
- 后端健康检查：http://localhost:8400/api/health
- API 文档：http://localhost:8400/docs

后端 entrypoint 流程：等待数据库就绪 → `create_all` 建表 → seed 初始数据 → 启动 uvicorn。

## 功能模块

1. **Auth**：JWT 登录（OAuth2 Password），`/api/auth/login`、`/api/auth/me`
2. **Hatchery 育苗场**：`name`、`seawaterSource`、`notes`
3. **Pond 育苗塘**：`hatcheryId`、`pondCode`、`species`、`volumeM3`、`status(stocked|dry|quarantine)`；同场 `pondCode` 唯一
4. **WaterSample 水质样**：`pondId`、`sampledAt`、`tempC`、`salinityPpt`、`doMgL`、`ph`、`notes`、`status(draft|pending|published)`；`doMgL > 0` 且 `ph ∈ [6,9]`，否则返回 **400**
   - **发布状态机**：新建一律为 `draft` 草稿
     - 技术员（technician）：`draft → pending`（提交待审）
     - 场长（admin）：`pending → published`（发布）、`pending → draft`（退回草稿）
     - 非法跳转（含重复提交同状态）返回 **409**，中文提示；越权操作返回 **403**
     - 已发布水质样禁止修改测值字段（`PUT` 返回 **409**）；草稿、待审可编辑
   - **列表规则**：`GET /api/water-samples` 默认只返回已发布；带 `status` 参数可查其他状态：`draft`、`pending`、`published`、`all`（逗号可组合），非法值返回 **400**
   - 状态变更接口：`PATCH /api/water-samples/{id}/status`，请求体 `{"status": "pending|published|draft"}`
   - 种子数据同时包含草稿、待审与已发布水质样
5. **FeedEvent 投喂**：`pondId`、`fedAt`、`feedType`、`amountKg`、`operatorName`
6. **Dashboard**：塘总数、quarantine 数、近 24h **已发布** 采样数（草稿/待审不计入）、近 7 日投喂总量 kg
7. **塘口草稿提示**：`PondOut` 带 `draftSampleCount`，育苗塘页展示每个塘口未发布的草稿水质样数量

## 前端页面

Login · Dashboard · Hatcheries · Ponds · WaterSamples · FeedEvents

## 本地开发（可选）

```bash
# 数据库（或用 compose 只起 db）
docker compose up -d db

# 后端
cd backend
pip install -r requirements.txt
set DATABASE_URL=postgresql+psycopg2://tidenursery:tidenursery@localhost:5434/tidenursery
python -c "from app.database import Base, engine; from app import models; Base.metadata.create_all(bind=engine)"
python -c "from app.seed import seed; seed()"
uvicorn app.main:app --reload --port 8400

# 前端
cd frontend
npm install
npm run dev
```

## 目录结构

```
TideNursery-01/
├── docker-compose.yml
├── README.md
├── .gitignore
├── backend/
│   ├── Dockerfile
│   ├── entrypoint.sh
│   ├── requirements.txt
│   └── app/
│       ├── main.py
│       ├── config.py
│       ├── database.py
│       ├── auth.py
│       ├── seed.py
│       ├── models/
│       ├── schemas/
│       └── routers/
└── frontend/
    ├── Dockerfile
    ├── nginx.conf
    ├── package.json
    ├── vite.config.ts
    └── src/
        ├── pages/
        ├── components/
        └── api/
```
