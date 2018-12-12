# AR-Talk-Web

## 项目介绍

AR-Talk-Web智能调度对讲，基于RTMaxEngine SDK，可以作为指挥调度端，对远端进行视频监看，接受视频上报、实时音频对讲，音视频通话，发送实时消息等功能。</br>

## 如何使用？

### 注册账号
登陆[AnyRTC官网](https://www.anyrtc.io/)

### 填写信息
创建应用，在管理中心获取开发者ID，AppID，AppKey，AppToken，替换AppDelegate.h中的相关信息

### 操作步骤：
配合Android和iOS使用，web为调度台，Android和iOS为执勤端。

1、Web端开启调度台，在启动一个手机</br>

2、Web端输入手机端的id,可以监看手机端、对讲、音视频通信。</br>

### 安装依赖
```
npm install
```

### 运行环境调试
```
npm run serve
//访问http://localhost:8080
```

### 打包编译
```
npm run build
```

### 资源中心

[更多详细方法使用，请查看API文档](https://www.anyrtc.io/resoure)

## 体验 DEMO
[立即体验](https://ar.teameeting.cn/)

## Android版

[AR-Talk-iOS](https://github.com/anyRTC/AR-Talk-iOS)

## Android版

[AR-Talk-Android](https://github.com/anyRTC/AR-Talk-Android)

## 技术支持
anyRTC官方网址：https://www.anyrtc.io </br>
anyRTC官方论坛：https://bbs.anyrtc.io </br>
QQ技术交流群：554714720 </br>
联系电话:021-65650071-816 </br>
Email:hi@dync.cc </br>

## 关于直播
本公司有一整套直播解决方案，特别针对移动端。本公司开发者平台[www.anyrtc.io](http://www.anyrtc.io)。除了基于RTMP协议的直播系统外，我公司还有基于WebRTC的时时交互直播系统、P2P呼叫系统、会议系统等。快捷集成SDK，便可让你的应用拥有时时通话功能。欢迎您的来电~

## License

RTCPEngine is available under the MIT license. See the LICENSE file for more info.
