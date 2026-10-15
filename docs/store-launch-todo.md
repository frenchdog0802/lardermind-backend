<!-- AIGC START -->
# LarderMind — iOS（TestFlight → App Store）上线 Todo

**Created:** 2026-09-09  
**Updated:** 2026-10-15  
**Goal:** **iOS 先行**；先 TestFlight / 家人测，再视情况公开上架 App Store  
**生产 API：** Cloudflare Workers（`backend-cf`）  
**订阅：** Pro 一起做（App Store / StoreKit）  
**功能范围：** 不冻结  
**Android / Play：** 本轮延后 ⏭  
**长期目标托管：** Cloudflare（Pages / Workers / D1 / …）— 见 [architecture/cloudflare-target.md](./architecture/cloudflare-target.md)  
**产品闭环（库房→食谱→日历预留→购物→对话）：** 分 phase 见 [features/kitchen-closed-loop.md](./features/kitchen-closed-loop.md)

> 状态约定：`[ ]` 未开始 · `[~]` 进行中 · `[x]` 完成 · `⏭` 本轮可延后

### 已拍板（Phase 0）

| 项 | 决定 |
|----|------|
| 首发平台 | **iOS**（先 TestFlight / 家人用；公开 App Store 可选下一阶段） |
| 首发模式 | **Pro 订阅一起上**（App Store In-App Purchase / StoreKit） |
| 生产 API | **Cloudflare Workers `backend-cf`** |
| 功能范围 | **不冻结** — 不主动砍功能；「较低优先级」仅作参考 |
| Android / Play | **延后**（搞完 iOS 再做） |

---

## Phase 0 — 范围确认

- [x] 确认首发平台：**iOS**（TestFlight 优先；App Store 公开后做）
- [x] 确认首发模式：**Pro 订阅一起上**
- [x] 确认生产 API：**Cloudflare Workers `backend-cf`**
- [x] 功能范围：**不冻结**
- [x] Android / Google Play：**本轮不做**（iOS 完成后再搞）

---

## Phase 1 — 生产后端就绪

- [ ] 生产环境 Workers + D1 稳定（HTTPS）
- [ ] 环境变量齐全：JWT、LLM / Workers AI、CORS、订阅相关
- [ ] Health check 通过；CORS 只放行正式域名 / App
- [ ] Chat send / stream / history / resume 生产冒烟
- [ ] Subscription status / quota 生产冒烟
- [ ] 确认 mobile EAS 的 `EXPO_PUBLIC_API_BASE_URL` 指向生产 API（如 `https://api.lardermind.com/api/`）
- [ ] 备份与基本监控（至少错误日志可查：平台 Logs + `/api/health` 存活探测）

---

## Phase 1.5 — Apple 账号与 EAS（iOS 前置）

- [x] 注册 / 续费 **Apple Developer Program**（约 $99/年）
- [x] App Store Connect 创建 App（Bundle ID = `com.lardermind.app`；ascAppId=`6823048274`）
- [ ] Expo / EAS 绑定 Apple 账号；能打出 **iOS** 签包
- [ ] 家人 Apple ID 加入 TestFlight（Internal / External testing）— 晚点

**已记录：**

| 项 | 值 |
|----|------|
| Apple Developer Team ID | `535UF7UZS4`（已写入 `mobile/app.json` / `eas.json`） |
| Bundle ID | `com.lardermind.app` |
| App Store Connect App | **已建立**；ascAppId=`6823048274`（已写入 `eas.json`） |
| TestFlight 家人 Apple ID | 晚点 |
| 商店支持邮箱 | 可用客服邮箱（不必等于 Developer 登录 Apple ID） |

**邮箱怎么分：**

| 用途 | 用哪个 |
|------|--------|
| 登录 Apple Developer / App Store Connect、签协议、建 App | **Developer Program 那个 Apple ID** |
| App Store「Support URL / 客服联系」字段 | **客服邮箱即可**（例如 `x6815541@gmail.com`） |

**在 App Store Connect 建 App（约 2 分钟；需你本机登录）：**

1. 打开 [App Store Connect → My Apps](https://appstoreconnect.apple.com/apps) → **+** → **New App**
2. Platforms: **iOS**
3. Name: `LarderMind`
4. Primary Language: 按你目标市场选（例如 English (U.S.) 或 Chinese）
5. Bundle ID: 选 / 注册 **`com.lardermind.app`**（若列表没有：先到 [Certificates, Identifiers & Profiles → Identifiers](https://developer.apple.com/account/resources/identifiers/list) 新建 App ID，Explicit，Bundle ID = `com.lardermind.app`）
6. SKU: `lardermind`（任意内部代号，不对外显示）
7. User Access: Full Access
8. 建好后到 **App Information** 复制 **Apple ID**（一串数字）发我 → 我会写入 `eas.json` 的 `ascAppId`

---

## Phase 2 — 真机 IAP（StoreKit）

> TestFlight 若要测真实订阅，需在 App Store Connect 建好订阅商品 + Sandbox / TestFlight 测试账号。

- [ ] App Store Connect 创建订阅：`com.lardermind.pro.monthly` / `com.lardermind.pro.yearly`
- [ ] 重写 `mobile/src/services/iapService.ts`：接真 `react-native-iap`（iOS StoreKit；去掉 mock）
- [ ] 收据 / 交易走后端 `validate-receipt` / `sync`（platform=`ios`）
- [ ] Restore Purchases 可用且文案合规
- [ ] 试用 / Pro / 免费额度 UI 与后端一致
- [ ] Sandbox / TestFlight 测：购买、续订、取消、恢复
- [ ] 非 Pro 触达 AI 配额上限时有清晰引导升 Pro
- [ ] ⏭ Play Console 订阅商品（Android 后做）
- [ ] ⏭ Play Billing 购买流（Android 后做）

---

## Phase 3 — 合规材料

> **先给家人 TestFlight：** 隐私政策建议尽快有；完整商店截图可稍后。  
> **公开 App Store：** 下列多数变为硬性。

- [ ] 上线 Privacy Policy 公开 URL
- [ ] 上线 Terms of Service 公开 URL（公开上架前）
- [ ] App 内可打开隐私政策 / 条款（Settings）
- [ ] **账号删除**入口 + 后端删除 / 匿名化（公开上架硬性；内测也建议有）
- [ ] ⏭ App Privacy / 年龄分级 / 商店截图与文案（公开上架时做）
- [ ] ⏭ 客服联系方式、订阅自动续订披露（公开上架时做）

---

## Phase 4 — iOS 构建与质量闸门

- [ ] EAS 打出可安装的 **iOS** 包（preview / production；TestFlight 用）
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
- [ ] 权限文案合理（相册 / 相机若使用须说明用途；`Info.plist` usage descriptions）
- [ ] 半残入口优先修（不冻结：能修则修）

---

## Phase 5 — TestFlight 内测（本轮主目标）

- [ ] 上传 build 到 App Store Connect → TestFlight
- [ ] 通过 TestFlight 合规 / 出口合规等必要问题
- [ ] 邀请家人安装 → 安装 LarderMind
- [ ] 收集反馈：闪退、登录、聊天、购买
- [ ] 修完再发新 build 迭代

---

## Phase 6 — 公开 App Store（可选下一阶段）

- [ ] 商店材料齐全（截图、描述、App Privacy、账号删除等）
- [ ] App Store Connect 正式提审 / 发布
- [ ] 审核备注：测试账号、IAP 路径（如适用）
- [ ] 通过后上架；盯崩溃 / API / 订阅
- [ ] ⏭ Android Play 内测 / 公开上架（更后）

---

## Phase 7 — Android（⏭ iOS 完成后再做）

> 整段延后；细节可沿用下方旧清单思路。

- [ ] ⏭ 注册 / 续费 Google Play Console（一次性约 $25）
- [ ] ⏭ Play Console 创建 App；EAS 打 Android 签包（AAB）
- [ ] ⏭ Play Billing 订阅商品 + `iapService` Android 路径 + `platform=android` 校验
- [ ] ⏭ Internal / Closed testing → 家人安装 → 迭代
- [ ] ⏭（可选）正式提审 Google Play

---

## 较低优先级（不冻结 — 可穿插）

- [ ] 忘记密码
- [ ] Mobile Google 注册完善
- [ ] Settings 云端持久化
- [ ] Landing waitlist 接真
- [ ] Web 订阅 / Stripe Checkout UI（实现已接；需填 Stripe env 后验收）
- [ ] 更全自动化测试 / CI 重建
- [ ] Android / Play Billing

---

## 建议里程碑（iOS 先行）

| 里程碑 | 目标 |
|--------|------|
| 生产 API + 冒烟 | 先完成 |
| Apple Developer + ASC App + EAS iOS 签包 | 紧接着 |
| StoreKit / 订阅沙盒打通 | 内测前 |
| 首个 TestFlight 包给家人用 | 本轮主目标 |
| TestFlight 稳定迭代 | 持续 |
| （可选）正式提审 App Store | 视情况 |
| Android / Play | iOS 稳定后再排 |

---

## 相关代码 / 配置

| 项 | 位置 |
|----|------|
| Mobile EAS profiles | `mobile/eas.json` |
| Package / Bundle ID | `mobile/app.json` → `com.lardermind.app` |
| IAP stub（待替换） | `mobile/src/services/iapService.ts` |
| Subscription API client | `mobile/src/api/subscription.ts` |
| CF subscription | `backend-cf/`（IAP validate/sync 若尚未接齐需补） |
| Product IDs | `com.lardermind.pro.monthly` / `com.lardermind.pro.yearly` |

---

## Notes

- 本轮主路径：**App Store Connect → EAS iOS → TestFlight → 家人安装**。
- App 内解锁 Pro 必须走 **App Store IAP**，不能只用 Stripe 替代。
- iOS 签包依赖 Apple Developer + EAS；本机 Windows 不能本地打 iOS，用 **EAS 云端构建**。
- 当前 `iapService` 仍是 mock；接真 StoreKit 前，TestFlight 也能先测主功能（订阅页可能仍是 stub）。
- **Android / Play：搞完 iOS 再来。**
- `PROJECT_STATUS.md` 偏旧；以本文件 Phase 0 为准。
<!-- AIGC END -->
