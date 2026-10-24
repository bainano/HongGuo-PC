# 红果短剧 vX.Y.Z

> 好看的短剧尽在红果短剧

一句话定位：本次是什么版本、提供哪些平台的安装包。

## 系统支持范围

**支持的操作系统：Windows 10 与 Windows 11。**

| 系统 | 架构 | 支持情况 |
| --- | --- | --- |
| Windows 10 / 11 | x64（64 位） | 支持 |
| Windows 10 / 11 | ARM64 | 支持 |
| Windows 10 / 11 | x86（32 位） | 不提供：Electron 44 起上游不再发布 32 位 Windows 运行时 |
| Windows 7 / 8 | — | 不支持：Electron 已放弃这些系统 |

## 下载

| 文件 | 适用 |
| --- | --- |
| `HongGuo-PC-Setup-<版本>.exe` | Windows 10/11 通用安装器（内含 x64 + ARM64，按机型自动选择） |
| `HongGuo-PC-Setup-<版本>-win-x64.exe` | Windows 10/11 64 位安装器 |
| `HongGuo-PC-Setup-<版本>-win-arm64.exe` | Windows 10/11 ARM64 安装器 |
| `HongGuo-PC-<版本>-win-x64.zip` | Windows 10/11 64 位免安装便携版 |
| `HongGuo-PC-<版本>-win-arm64.zip` | Windows 10/11 ARM64 免安装便携版 |
| `HongGuo-PC-<版本>-x64.dmg` | macOS Intel |
| `HongGuo-PC-<版本>-arm64.dmg` | macOS Apple Silicon |

> 文件名使用 ASCII：GitHub Release 的上传接口会剥离资产名中的非 ASCII 字符。
> 安装包内部与安装界面显示的产品名仍是「红果短剧」。

**Windows**：双击安装器即可，会自动弹出 UAC 申请管理员权限，不需要手动右键「以管理员身份运行」。

**macOS**：打开 dmg，把「红果短剧」拖进「应用程序」。未接入 Apple 开发者签名，
首次启动请「右键 → 打开」，或在「系统设置 → 隐私与安全性」中确认「仍要打开」一次。

## 本版本更新

### 新增

- ...

### 修复

- ...

### 变更

- ...

## 已知问题

- ...

## 说明与免责

本项目为个人学习与技术交流用途的第三方客户端，与红果短剧官方无任何隶属、授权或合作关系；
不托管、不转存任何影视内容，所有数据均实时取自官方公开接口，版权归原权利人所有。
请勿用于商业用途。

源码按 **GPL-3.0** 开源（内容引擎源自 GPL-3.0 授权的第三方项目，
见 `backend/server/vendor/NOTICE.md`）。
