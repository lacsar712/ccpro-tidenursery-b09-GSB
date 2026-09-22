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
4. **WaterSample 水质样**：`pondId`、`sampledAt`、`tempC`、`salinityPpt`、`doMgL`、`ph`、`notes`、`status`；`doMgL > 0` 且 `ph ∈ [6,9]`，否则返回 **400**
   - 发布状态机：`draft 草稿 → pending 待审 → published 已发布`
   - 新建一律为 **草稿**。技术员可「提交待审」；**场长**可「发布」或「退回草稿」（技术员无此权限，返回 403）
   - 非法流转（如草稿直接发布、已发布再发布）返回 **409** 与中文提示，例如：
     `非法状态流转：当前为草稿，仅待审可发布`
   - **已发布后禁止修改任何内容字段**（测值/时间/塘口/备注，PUT 返回 409）；草稿与待审可编辑
   - 列表 `GET /api/water-samples` **默认只返回已发布**；带 `?status=draft|pending|published` 可查对应状态
   - 仪表盘「近 24h 采样数」**只计已发布**；草稿与待审不计入
   - `GET /api/water-samples/draft-counts` 返回各塘口草稿数，塘口页显示「N 篇草稿」提示
5. **FeedEvent 投喂**：`pondId`、`fedAt`、`feedType`、`amountKg`、`operatorName`
6. **Dashboard**：塘总数、quarantine 数、**近 24h 已发布**采样数、近 7 日投喂总量 kg

### 水质样状态机

```
            新建
             │
             ▼
        ┌────────┐  技术员 submit    ┌─────────┐  场长 publish   ┌───────────┐
        │ draft  │ ────────────────▶ │ pending │ ──────────────▶ │ published │
        │ 草稿   │                   │ 待审    │                  │ 已发布    │
        └────────┘                   └─────────┘                  └───────────┘
             ▲                           │
             │      场长 reject 退回      │
             └───────────────────────────┘

可改内容字段： draft ✅   pending ✅   published ❌（409 已发布的水质样禁止修改测值）
进入默认列表/看板近一天计数：仅 published
```

| 接口 | 方法 | 说明 |
| --- | --- | --- |
| `/api/water-samples?status=` | GET | 无参数仅已发布；status 取 draft/pending/published |
| `/api/water-samples` | POST | 新建，恒为 draft |
| `/api/water-samples/{id}` | PUT | 修改内容，仅 draft/pending |
| `/api/water-samples/{id}/status` | PATCH | `{"action": "submit\|publish\|reject"}` |
| `/api/water-samples/draft-counts` | GET | 各塘口草稿数 |

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
