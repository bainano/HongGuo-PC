# 发布说明（Release Notes）

每个版本的发布说明单独一份文件，**文件名即版本号**，发布时由工作流自动取用。

```
docs/releases/
├─ README.md      本说明
├─ TEMPLATE.md    新版本说明模板（复制后改名为 <版本号>.md）
└─ v1.0.0.md      已发布版本的说明
```

## 命名规则

- 文件名 = Git 标签名（带 `v` 前缀），例如标签 `v1.0.1` → `docs/releases/v1.0.1.md`
- 也兼容不带 `v` 的写法（`1.0.1.md`），工作流会依次查找两种
- 文件内容即该版本 GitHub Release 的正文（工作流 `body_path` 取的就是这份文件）

## 发版时怎么做

1. 复制 `TEMPLATE.md` 为 `docs/releases/v<新版本号>.md`
2. 按模板填写：系统支持范围 / 下载清单 / 新增 / 修复 / 变更 / 已知问题 / 免责
3. 下载清单里的资产名必须与规范名一致（见 `docs/RELEASE_PROCESS.md` 第 3 节）
4. 提交 → 打标签 → 推送，工作流会自动用这份文件作为 Release 正文
