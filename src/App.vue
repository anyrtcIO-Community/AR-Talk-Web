<template>
  <div class="app" id="app">
    <header>
      <h1 title="anyRTC智能调度平台">AR智能调度平台</h1>
      <div class="userid">用户ID:{{ userId }}</div>
      <!-- <div class="member">当前3人在线</div> -->
    </header>
    <div class="main">
      <!-- 日志 -->
      <div class="log_view" ref="log">

      </div>
      <!-- 视频监控 -->
      <div class="video_view">
        <videoPlayer v-for="(item, index) in monitorVideoData" :key="index" :vSrc="item.src" :uId="item.uid" :pId="item.pid" :bClose="item.needClose" @closeVideo="handleCloseMonitor"></videoPlayer>
      </div>
      <!-- 控制区域 -->
      <div class="control_view">
        <div class="speaker_tip_wrap">
          <div class="speaker_tip" v-show="speakerId!== ''">{{ `ID:${speakerId}正在发言` }}</div>
        </div>
        
        <div class="admin-control">
          <button type="button" @click="applyTalk">{{ applyTalkOk ? "取消对讲" : "申请对讲" }}</button>
          <button type="button" :disabled="speakerId ==='' ? true : false" @click="breakTalk">打断当前组对讲</button>
          <button type="button" :disabled="speakerId ==='' && !onTalkp2p ? true : false" @click="talkP2P">{{ onTalkp2p ? "取消强插对讲" : "强插对讲" }}</button>
        </div>

        <div>
          <div class="more-feature">
            <div class="more-feature_bg"></div>
            <div class="more-feature_text">更多功能</div>
          </div>
          <div class="control-from_item">
            <input type="text" placeholder="请输入用户ID" v-model="monitorUserId"> <button type="button" @click="monitorVideo">发起监控</button>
          </div>
          <div class="control-from_item">
            <input type="text" placeholder="请输入用户ID" v-model="callUserId"> <button type="button" @click="makeCall(0)" :disabled="onCall ? true : false">视频呼叫</button> <button type="button" @click="makeCall(1)" :disabled="onCall ? true : false">音频呼叫</button>
          </div>
          <div class="control-from_item">
            <input type="text" placeholder="请输入用户ID" v-model="breakUserId"> <button type="button" @click="breakCall">打断通话&打断强插对讲（不包含对讲）</button>
          </div>
          <div class="control-from_item">
            <input type="text" placeholder="请输入广播消息" v-model="smsText"> <button type="button" @click="sendGroupMessage">群组消息</button>
          </div>
        </div>

        <div class="SMS" ref="smsBox">
          <div class="SMS-item" v-for="(item, index) in msgList" :key="index">
            <p>ID：{{item.uid}}</p>
            <div class="SMS-item_text">{{item.txt}}</div>
          </div>
        </div>
      </div>

      <!-- 通话Dialog -->
      <div class="call-dialog" v-if="callDialog">
        <div class="call-dialog_header">
          <div class="call-dialog_search"><input type="text" placeholder="请输入用户ID" v-model="inviteUserId"><button type="button" @click="inviteCall"  v-show="isCalled">呼叫邀请</button></div>
          <div class="close-dialog_btn" @click="endAllCall">关闭</div>
        </div>
        <div class="call-dialog_content">
          <video :src="localVideoSrc" autoplay muted></video>
          <div class="invite-call">
            <videoPlayer v-for="(item, index) in callVideoData" :key="index" :vSrc="item.src" :uId="item.uid" :pId="item.pid" @closeVideo="handleEndCall"></videoPlayer>
          </div>
        </div>
      </div>

    </div>
  </div>
</template>

<script>
import utils from './mixins/utils';
import videoPlayer from './components/video.vue';

export default {
  name: 'App',

  data () {
    return {
      rtcMax: null,
      groupId: '123456789',
      userData: {
        userid: this.userId
      },
      localStream: null,
      isCalled: true,
      //表单id
      monitorUserId: '',
      callUserId: '',
      inviteUserId: '',
      breakUserId: '',
      smsText: '',
      
      //对讲
      speakerId: '',//当前发言人id
      applyTalkOk: false,//申请对讲是否成功
      
      //强插     
      onTalkp2p: false,//是否强插对讲
      
      //监看用户
      monitorVideoData: [],
      
      //上报标识
      onReport: false,
      
      //呼叫
      byMakeCall: false,//被呼叫身份标识
      onCall: false,//是否发起呼叫
      currentCallId: '',
      callDialog: false,
      callVideoData: [],

      //消息
      msgList: []
    }
  },

  components: {
    videoPlayer
  },

  computed: {
    userId () {
      return this.randomUserId(4);
    },
    localVideoSrc () {
      return this.localStream ? URL.createObjectURL(this.localStream) : ''
    }
  },

  mixins: [utils],

  methods: {
    addLog (type, logText) {
      let that = this;
      var span = document.createElement('span');
      span.className = type;
      var str = "$ ";
      span.innerHTML = (str += logText);
      that.$refs.log.appendChild(span);
      var br = document.createElement('br');
      that.$refs.log.appendChild(br);

      that.$nextTick(() => {
        that.$refs.log.scrollTop = (that.$refs.log.scrollHeight - that.$refs.log.offsetHeight);  
      })
    },
    //申请对讲
    applyTalk () {
      if (!this.applyTalkOk) {
        this.rtcMax.applyTalk(0);
      } else {
        this.rtcMax.cancelTalk();
      }
    },
    //打断对讲组所有对讲
    breakTalk () {
      this.rtcMax.breakTalk(this.groupId);
    },
    //强制发起P2P对讲
    talkP2P () {
      if (!this.onTalkp2p) {
        this.rtcMax.talkP2P(this.speakerId, JSON.stringify(this.userData));
      } else {
        this.rtcMax.closeP2PTalk();
      }
    },
    //发起通话请求
    makeCall (nType) {

      if (this.callUserId === "" || typeof nType !== "number") {
        return;
      }
      if( this.callUserId == this.userId ){
        this.addLog('error', `不能对自己发起视频或音频呼叫`);
        return;
      }
      if(this.speakerId == this.callUserId){
        this.rtcMax.breakTalk(this.groupId);
      }
      if(nType == 0){
          this.addLog('null', `对用户${this.callUserId}发起视频呼叫`);
      }else{
        this.addLog('null', `对用户${this.callUserId}发起音频呼叫`);
      }
      this.rtcMax.makeCall(this.callUserId, nType, JSON.stringify(this.userData));
    },
    //发起通话邀请
    inviteCall () {
      if (this.inviteUserId === "") {
        return;
      }
      let continueCall = true;
      if(this.inviteUserId != this.userId){
        this.callVideoData.map((item) =>{
          if(item.uid == this.inviteUserId){
            continueCall = false
          }
        })
        if(continueCall == true ){
          this.rtcMax.inviteCall(this.inviteUserId, JSON.stringify(this.userData));
        }  
      }else{
        this.addLog('error', `不能邀请自己进行视频通话`);
      }
    },
    //发起监看
    monitorVideo () {
      if (this.monitorUserId !== "") {
        if(this.monitorUserId != this.userId){
          let continueMonitor = true;
          this.monitorVideoData.map((item) =>{
            if(item.uid == this.monitorUserId){
              continueMonitor = false;
            }
          })
          if(continueMonitor == true){
            this.addLog('null', `对用户${this.monitorUserId}发起视频监看`);
            this.rtcMax.monitorVideo(this.monitorUserId, JSON.stringify(this.userData));
          }else{
            this.addLog('error', `用户${this.monitorUserId}正在上报或监看`);
          }
        }else{
          this.addLog('error', `不能对自己进行监看`);
        }
      }
    },
    //打断用户的通话或对讲
    breakCall () {
      if (this.breakUserId !== "") {
        this.addLog('null', `打断用户${this.breakUserId}通话或强插对讲`);
        this.rtcMax.breakCall(this.breakUserId);
      }
    },
    //发送群组消息
    sendGroupMessage () {
      if (this.smsText !== "") {
        this.rtcMax.sendUserMessage('name', 'headerurl', this.smsText);
        this.addMSG(this.userId, this.smsText);
      }
    },
    addMSG (uid, txt) {
      this.msgList.push({
        uid: uid,
        txt: txt
      });
      this.$nextTick(() => {
        this.$refs.smsBox.scrollTop = (this.$refs.smsBox.scrollHeight - this.$refs.smsBox.offsetHeight);  
      });
    },
    //关闭监看
    handleCloseMonitor (strUserId, strPubId) {
      this.addLog('error', `取消监看用户${this.monitorUserId}`);
      this.rtcMax.closeVideoMonitor(strUserId);
    },
    //结束所有通话
    endAllCall () {
      if (this.byMakeCall) {
        this.rtcMax.leaveCall();
        this.callDialog = false;
      } else {
        this.rtcMax.endCall(this.currentCallId);//结束回话用callid，结束某一个人用peerUserId
      }
    },
    //挂断呼叫或邀请
    handleEndCall (strUserId, strPubId) {
      console.log('挂断呼叫或邀请', strUserId)
      if (this.byMakeCall) {
        this.rtcMax.leaveCall();
        this.callDialog = false;
      } else {
        this.rtcMax.endCall(strUserId);
      }
    }
  },

  mounted () {
    let that = this;
    
    let rtcMax = that.rtcMax = new RTMaxKit();
    //前往平台获取配置开发者信息
    let DEV_ID = "";
    let APP_ID = "";
    let APP_KEY = "";
    let APP_TOKEN = "";
    let APP_DOMAIN = "";

    rtcMax.initEngineWithAnyRTCInfo(DEV_ID, APP_ID, APP_KEY, APP_TOKEN, APP_DOMAIN);
    rtcMax.configServerForPriCloud("pro.anyrtc.io", null);
    rtcMax.setLocalVideoCapturer();

    //创建本地视频流成功
    rtcMax.on("onSetLocalVideoCapturerResult", function (code, element, stream) {
      if (code == 0) {
        that.addLog('success', "创建本地视频流成功");

        that.localStream = stream;
        rtcMax.joinTalkGroup(that.groupId, '' + that.userId, JSON.stringify(that.userData));
      } else {
        that.addLog('error', "创建本地视频流失败, 错误码为："+ code);
      }
    });
    //加入对讲组成功
    rtcMax.on('onRTCJoinTalkGroupOK', function (myId) {
      that.addLog('success', "加入对讲组成功");
    });
    //连接失败，弹确认框
    rtcMax.on('onRTCJoinTalkGroupFailed', function (error) {
      that.addLog('error', "加入对讲组失败，错误码为："+ error);
    });
    //创建本地视频流失败
    rtcMax.on("stream_create_error", function (error) {
      that.addLog('error', "创建本地媒体失败");
      window.location.reload();
    });

    //申请对讲成功
    rtcMax.on('onRTCApplyTalkOk', function () {
      //* 申请Talk - OK
      console.log('申请对讲成功');
      that.addLog('success', that.speakerId+ '正在发言');
      that.applyTalkOk = true;
      that.speakerId = that.userId;
    });
    
    //其他人正在对讲组中讲话回调
    rtcMax.on("onRTCTalkOn", function (userId, userData) {
      that.addLog('success', userId+ '正在发言');
      that.speakerId = userId;
    });
    
    //结束对讲回调
    rtcMax.on("onRTCTalkClosed", function (nCode, userId, userData) {
      switch (nCode) {
        case 0:
          that.addLog('error', userId + '结束发言');
          that.speakerId = '';
          that.applyTalkOk && (that.applyTalkOk = false);
          break;
        case 802:
          that.addLog('waring', '当前有人正在说话，您权限不够高');
          break;
        case 810:
          that.addLog('waring', '对讲麦序被抢走');
          that.applyTalkOk = false;
          break;
        case 811:
          that.addLog('error', '当前麦序被打断或释放');
          that.applyTalkOk = false;
          break;
        default: 
          that.applyTalkOk = false;
          break;
      }
    });

    //创建界面视频
    rtcMax.on('onRTCOpenVideoRender', function (strPubId, videoRender, rtcUserData, nType) {
      console.log("onRTCOpenVideoRender **********************", strPubId, videoRender, rtcUserData, nType);
      switch (nType) {
        case 0://对讲
        case 1://强插对讲
          videoRender.id = strPubId;
          document.body.appendChild(videoRender);
          break;
        case 2://视频监看
          let needCloseBtn = true;
          if (that.onReport) {
            needCloseBtn = false;
            that.onReport = false;
          }
          that.monitorVideoData.push({
            src: '',
            pid: strPubId,
            uid: that.monitorUserId,
            needClose: needCloseBtn
          })
          break;
        case 3://音频呼叫
        case 4://视频呼叫
          that.callVideoData.push({
            src: '',
            pid: strPubId,
            uid: that.callUserId
          })
          break;
      }
    });

    //删除界面视频
    rtcMax.on('onRTCCloseVideoRender', function (strPubId, nType) {
      console.log("onRTCCloseVideoRender **********************" + strPubId,  nType);

      switch (nType) {
        case 0://对讲
          document.getElementById(strPubId).remove();
          break;
        case 1://强插对讲
          document.getElementById(strPubId).remove();
          break;
        case 2://视频监看
          that.monitorVideoData.map((item, index) => {
            if (item.pid === strPubId) {
              that.monitorVideoData.splice(index, 1);
            }
          });
          break;
        case 3://音频呼叫
        case 4://视频呼叫
          that.callVideoData.map((item, index) => {
            if (item.pid === strPubId) {
              that.callVideoData.splice(index, 1);
            }
          });
          break;
      }
    });

    //设置远程流
    rtcMax.on('onRTCRemoteStream', function (stream, strPubId, nType) {
      console.log("onRTCRemoteStream **********************", strPubId, nType);
      switch (nType) {
        case 0://对讲
        case 1://强插对讲
          that.rtcMax.setRTCVideoRender(stream, document.getElementById(strPubId));
          break;
        case 2://视频监看
          that.monitorVideoData.map(item=> {
            if (item.pid === strPubId) {
              item.src = URL.createObjectURL(stream);
            }
          });
          break;
        case 3:
        case 4:
          that.callVideoData.map(item=> {
            if (item.pid === strPubId) {
              item.src = URL.createObjectURL(stream);
            }
          });
          break;
      }
    });

    //收到消息
    rtcMax.on('onRTCUserMessage', function (strUserId, strUserName, strUserHeadUrl, strUserData) {
      console.log("onRTCUserMessage **********************", strUserId, strUserName, strUserHeadUrl, strUserData);
      that.addMSG(strUserId, strUserData);
    });
    
    //强插对讲结果
    rtcMax.on('onRTCTalkP2POk', function (strUserData) {
      that.addLog('success', "强插对讲结果");
      that.onTalkp2p = true;
    });

    //强插对讲关闭
    rtcMax.on('onRTCTalkP2PClosed', function (nCode, strUserData) {
      that.addLog('success', "强插对讲关闭");
      that.onTalkp2p = false;
      // bTalkP2P && (bTalkP2P = false & $("#talkP2P").html('强插对讲'));
    });
    
    //离开对讲组
    rtcMax.on('onRTCLeaveTalkGroup', function (error) {
      that.addLog('success', "即将离开对讲组");
      // window.location.href = './';
    });

    //视频监看结果
    rtcMax.on('onRTCVideoMonitorResult', function (nCode, strUserId, strUserData) {
      console.log('监看用户：' + strUserId + '。结果：：' + nCode);
      if (nCode === 0) {
        that.monitorUserId = strUserId;
        that.addLog('success', `监看用户${strUserId}视频成功`);
      } else {
        that.addLog('error', `监看用户${strUserId}视频失败，错误码：${nCode}`);
      }
    });

    //收到被监看端拒绝或关闭监看
    rtcMax.on('onRTCVideoMonitorClose', function (strUserId, strUserData) {
      console.log('onRTCVideoMonitorClose ', strUserId, strUserData);
      that.addLog('error', `用户${strUserId}拒绝或挂断视频监控`);
    });

    //收到视频监看请求
    // rtcMax.on('onRTCVideoMonitor', function (strUserId, strUserData) {
    //   if (confirm(strUserId + '对你发起视频监看')) {
        
    //   } else {

    //   }
    //   console.log('监看用户：' + peerId + '。结果：：' + nCode);
    // });
   
    //视频上报
    rtcMax.on('onRTCVideoReport', function (strUserId, strUserData) {
      console.log(strUserId + ' 用户上报!');
      that.addLog('waring', `收到用户${strUserId}上报`);
      that.onReport = true;
      //监看
      rtcMax.monitorVideo(strUserId, "{hehe}");
    });

    //视频上报结束或取消
    rtcMax.on('onRTCVideoReportClose', function (strUserId) {
      console.log(strUserId + ' 用户结束上报！');
      that.addLog('error', `用户${strUserId}结束上报`);
    });
    

    /************* 呼叫 ****************/
    //--主叫方

    //呼叫成功
    rtcMax.on('onRTCMakeCallOK', function (strCallId) {
      console.log('呼叫' + strCallId + '中');
      that.currentCallId = strCallId;
      //收到该回调以后，代表通道已经建立，可以邀请其他用户（即使当前邀请用户未同意）
    });
    //被叫方接受通话
    rtcMax.on('onRTCAcceptCall', function (strUserId) {
      console.log(strUserId + ' 接受通话请求');
      that.addLog('success', `用户${strUserId}接受通话`);
      that.callUserId = strUserId;
      that.onCall = true;
      that.callDialog = true;
    });
    //被叫方拒绝通话
    rtcMax.on('onRTCRejectCall', function (strUserId, nCode) {
      console.log(strUserId + ' 拒绝通话请求，拒绝原因码：' + nCode);
      that.addLog('error', `用户${strUserId}拒绝通话`);
    });
    //主叫方收到被叫方离开
    rtcMax.on('onRTCLeaveCall', function (strUserId) {
      console.log('onRTCLeaveCall', strUserId);
      that.addLog('error', `用户${strUserId}挂断通话`);
    });
    //主叫方结束通话
    rtcMax.on('onRTCReleaseCall', function (code) {
      console.log('onRTCReleaseCall');
      that.addLog('error', `通话结束`);
      that.callUserId = "";
      that.onCall = false;
      that.callDialog = false;
      that.isCalled = true;
    });

    //-----被叫方

    //收到通话邀请
    rtcMax.on('onRTCMakeCall', function (strCallId, strCallType, strUserId, strUserData) {
      //接收通话申请或拒绝通话申请
      console.log('onRTCMakeCall', strCallId, strCallType, strUserId, strUserData);

      //设置被叫方身份
      console.log(123)
      console.log(that.callDialog)
      if( that.callDialog == true){
        that.rtcMax.rejectCall(strCallId);
      }else{
        that.addLog('null', '用户'+strUserId + '邀请您进行' + (strCallType == 0 ? '视频' : '音频') + '通话');
        if (confirm(strUserId + '邀请您进行' + (strCallType == 0 ? '视频' : '音频') + '通话')) {
          if (that.currentCallId != "") {
            that.endAllCall();
          }
          that.currentCallId = strCallId;
          that.byMakeCall = true;
          that.callDialog = true;
          rtcMax.acceptCall(strCallId);
          that.isCalled = false;
          that.addLog('success', '接受用户'+strUserId+'通话请求');
        } else {
          that.byMakeCall = false;
          rtcMax.rejectCall(strCallId);
          that.addLog('error', '拒绝用户'+strUserId+'通话请求');
        }
      }
    });
    //被叫方收到主叫方挂断通话
    rtcMax.on('onRTCEndCall', function (strCallId, strUserId, nCode) {
      that.addLog('error', '主叫方挂断通话');
      console.log('onRTCEndCall', strCallId, strUserId, nCode);
      that.byMakeCall && (that.byMakeCall = false);
      that.callDialog && (that.callDialog = false);
      that.currentCallId != "" && (that.currentCallId = "");
    });
    
    rtcMax.on('onError', function (errInfo) {
      alert(errInfo);
    });
  }
}
</script>

<style>
@import './assets/index.css';
#app {
  font-family: 'Avenir', Helvetica, Arial, sans-serif;
  -webkit-font-smoothing: antialiased;
  -moz-osx-font-smoothing: grayscale;
  color: #2c3e50;
}

::-webkit-scrollbar {/*隐藏滚轮*/
  display: none;
}
</style>
