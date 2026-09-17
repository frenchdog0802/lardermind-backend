<!-- AIGC START -->
# LarderMind — Android（内测 → Play）上线 Todo

**Created:** 2026-09-09  
**Updated:** 2026-09-14  
**Goal:** **Android 先行**；先内部 / 家人测，再视情况公开上架 Google Play  
**生产 API：** Nest `backend-node`  
**订阅：** Pro 一起做（Play Billing）  
**功能范围：** 不冻结  
**iOS / TestFlight / App Store：** 本轮延后 ⏭  
**长期目标托管：** Cloudflare（Pages / Workers / D1 / …）— 见 [architecture/cloudflare-target.md](./architecture/cloudflare-target.md)；**本轮生产 API 仍为 Nest，不迁 Workers**

> 状态约定：`[ ]` 未开始 · `[~]` 进行中 · `[x]` 完成 · `⏭` 本轮可延后

### 已拍板（Phase 0）

| 项 | 决定 |
|----|------|
| 首发平台 | **Android**（先内测 / 家人用；公开 Play 可选下一阶段） |
| 首发模式 | **Pro 订阅一起上**（Google Play Billing） |
| 生产 API | **Nest `backend-node`**（长期目标 CF Workers；本轮不变） |
| 功能范围 | **不冻结** — 不主动砍功能；「较低优先级」仅作参考 |
| iOS / Apple | **延后**（搞完 Android 再做） |

---

## Phase 0 — 范围确认

- [x] 确认首发平台：**Android**（内测优先；Play 公开后做）
- [x] 确认首发模式：**Pro 订阅一起上**
- [x] 确认生产 API：**Nest `backend-node`**
- [x] 功能范围：**不冻结**
- [x] iOS / TestFlight / App Store：**本轮不做**（Android 完成后再搞）

---

## Phase 1 — 生产后端就绪

- [ ] 生产环境部署 Nest（Render / Railway 等），HTTPS 稳定
- [ ] 生产 Postgres 迁移（含 chat-langgraph sessions 相关 SQL）
- [ ] 环境变量齐全：JWT、DB、LLM、Cloudinary、CORS、订阅相关
- [ ] Health check 通过；CORS 只放行正式域名 / App
- [ ] Chat send / stream / history / resume 生产冒烟
- [ ] Subscription status / quota 生产冒烟
- [ ] 确认 mobile EAS 的 `EXPO_PUBLIC_API_BASE_URL` 指向生产 Nest API
- [ ] 备份与基本监控（至少错误日志可查：平台 Logs + `/api/health` 存活探测）

---

## Phase 1.5 — Google 账号与 EAS（Android 前置）

- [ ] 注册 / 续费 **Google Play Console**（一次性约 $25）
- [ ] Play Console 创建 App（applicationId / package = `com.lardermind.app`）
- [ ] Expo / EAS 能打出 **Android** 签包（AAB / APK）
- [ ] 家人 Google 账号加入内测轨道（Closed testing / Internal testing）

---

## Phase 2 — 真机 IAP（Play Billing）

> 内测若要测真实订阅，需在 Play Console 建好订阅商品 + License testers。

- [ ] Play Console 创建订阅：`com.lardermind.pro.monthly` / `com.lardermind.pro.yearly`
- [ ] 重写 `mobile/src/services/iapService.ts`：接真 `react-native-iap`（Android Play Billing；去掉 mock）
- [ ] 收据 / 交易走后端 `validate-receipt` / `sync`（platform=`android`）
- [ ] Restore Purchases 可用且文案合规
- [ ] 试用 / Pro / 免费额度 UI 与后端一致
- [ ] License tester / 内测包测：购买、续订、取消、恢复
- [ ] 非 Pro 触达 AI 配额上限时有清晰引导升 Pro
- [ ] ⏭ App Store Connect 订阅商品（iOS 后做）
- [ ] ⏭ StoreKit / Apple IAP 购买流（iOS 后做）

---

## Phase 3 — 合规材料

> **先给家人内测：** 隐私政策建议尽快有；完整商店截图可稍后。  
> **公开 Play：** 下列多数变为硬性。

- [ ] 上线 Privacy Policy 公开 URL
- [ ] 上线 Terms of Service 公开 URL（公开上架前）
- [ ] App 内可打开隐私政策 / 条款（Settings）
- [ ] **账号删除**入口 + 后端删除 / 匿名化（公开上架硬性；内测也建议有）
- [ ] ⏭ Play Data safety / 内容分级 / 商店截图与文案（公开上架时做）
- [ ] ⏭ 客服联系方式、订阅自动续订披露（公开上架时做）

---

## Phase 4 — Android 构建与质量闸门

- [ ] EAS 打出可安装的 **Android** 包（preview / production；内测可用 APK 或 AAB）
- [ ] 去掉 / 关闭 stub 购买等会误导的路径
- [ ] 核心路径真机手测：
  - [ ] 注册 / 登录 / 登出
  - [ ] Chat 空态 → 发消息 → 工具卡片
  - [ ] 库存 CRUD
  - [ ] 购物清单（在线 + 离线再同步）
  - [ ] 菜谱 CRUD
  - [ ] 餐计划增删
  - [ ] Subscription 购买 / 恢复 / Pro 状态（若本轮已接 IAP）
  - [ ] 杀进程重启后登录态与关键数据正常
- [ ] 首发 blocker 级崩溃 / 明显 UI 问题清零
- [ ] 权限文案合理（相册 / 相机若使用须说明用途）
- [ ] 半残入口优先修（不冻结：能修则修）

---

## Phase 5 — Android 内测（本轮主目标）

- [ ] 上传 build 到 Play Console（Internal / Closed testing）
- [ ] 通过 Play 内测要求（如需要）
- [ ] 邀请家人安装 → 安装 LarderMind
- [ ] 收集反馈：闪退、登录、聊天、购买
- [ ] 修完再发新 build 迭代

---

## Phase 6 — 公开 Google Play（可选下一阶段）

- [ ] 商店材料齐全（截图、描述、Data safety、账号删除等）
- [ ] Play Console 正式提审 / 发布
- [ ] 审核备注：测试账号、IAP 路径（如适用）
- [ ] 通过后上架；盯崩溃 / API / 订阅
- [ ] ⏭ iOS TestFlight / App Store 公开上架（更后）

---

## Phase 7 — iOS（⏭ Android 完成后再做）

> 整段延后；细节可沿用下方旧清单思路。

- [ ] ⏭ 注册 / 续费 Apple Developer Program（约 $99/年）
- [ ] ⏭ App Store Connect 创建 App；EAS 绑 Apple；打 iOS 签包
- [ ] ⏭ StoreKit 订阅商品 + `iapService` iOS 路径 + `platform=ios` 校验
- [ ] ⏭ TestFlight → 家人安装 → 迭代
- [ ] ⏭（可选）正式提审 App Store

---

## 较低优先级（不冻结 — 可穿插）

- [ ] 忘记密码
- [ ] Mobile Google 注册完善
- [ ] Settings 云端持久化
- [ ] Landing waitlist 接真
- [ ] Web 订阅 / Stripe Checkout UI（Web 收费再用；App 内仍走商店 IAP）
- [ ] Spring 完全下线、只留 Nest
- [ ] 更全自动化测试 / CI 重建
- [ ] iOS / StoreKit / TestFlight

---

## 建议里程碑（Android 先行）

| 里程碑 | 目标日（自 2026-09-14） |
|--------|------------------------|
| Nest 生产 API + 冒烟 | ~09-21 |
| Play Console + EAS Android 签包 | ~09-23 |
| Play Billing / 订阅沙盒打通 | ~09-30 |
| 首个内测包给家人用 | ~10-05 |
| 内测稳定迭代 | ~10-12 |
| （可选）正式提审 Play | 视情况 |
| iOS / TestFlight | Android 稳定后再排 |

---

## 相关代码 / 配置

| 项 | 位置 |
|----|------|
| Mobile EAS profiles | `mobile/eas.json` |
| Package / Bundle ID | `mobile/app.json` → `com.lardermind.app` |
| IAP stub（待替换） | `mobile/src/services/iapService.ts` |
| Subscription API client | `mobile/src/api/subscription.ts` |
| Nest subscription | `backend-node/src/subscription/` |
| Usage quota | `backend-node/src/usage-quota/` |
| Product IDs | `com.lardermind.pro.monthly` / `com.lardermind.pro.yearly` |

---

## Notes

- 本轮主路径：**Play Console → EAS Android → 内测 → 家人安装**。
- App 内解锁 Pro 必须走 **Google Play Billing**，不能只用 Stripe 替代。
- Windows 本机可直接打 Android；用 **EAS 云端构建**也可。
- 当前 `iapService` 仍是 mock；接真 Play Billing 前，内测也能先测主功能（订阅页可能仍是 stub）。
- **Apple / TestFlight：搞完 Android 再来。**
- `PROJECT_STATUS.md` 偏旧；以本文件 Phase 0 为准。
<!-- AIGC END -->
