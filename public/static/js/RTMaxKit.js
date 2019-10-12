/*! rtmak_kit.js build:0.0.2, development. Copyright(c) 2017 BoYuan@SH */
(function (exports) {
	var gThis = null;
	var CT_INIT = 0;
	var CT_AUDIO = 1;
	var CT_VIDEO = 2;
	
	var OPT_TALK = 0;			// 上麦
	var OPT_TALK_P2P = 1;		// 强插对讲
	var OPT_VID_MONITOR = 2;	// 视频调用(或终端上报查看)
	var OPT_CALL_AUDIO = 3;		// 音频对讲
	var OPT_CALL_VIDEO = 4;		// 视频对讲
	//注销
	window.onbeforeunload = function () {
		if (gThis != null) {
			gThis.leaveRTC();
			gThis = null;
		}
	};

	/**********************************************************/
	/*                                                        */
	/*                       事件处理器                       */
	/*                                                        */
	/**********************************************************/
	function EventEmitter() {
		this.events = {};
	}
	//绑定事件函数
	EventEmitter.prototype.on = function (eventName, callback) {
		this.events[eventName] = this.events[eventName] || [];
		this.events[eventName].push(callback);
	};
	//触发事件函数
	EventEmitter.prototype.emit = function (eventName, _) {
		var events = this.events[eventName],
			args = Array.prototype.slice.call(arguments, 1),
			i, m;

		if (!events) {
			return;
		}
		for (i = 0, m = events.length; i < m; i++) {
			events[i].apply(null, args);
		}
	};

	// 字节计算
	function strlen(str) {
		var len = 0;
		for (var i=0; i<str.length; i++) {
			var c = str.charCodeAt(i);
			//单字节加1
			if ((c >= 0x0001 && c <= 0x007e) || (0xff60<=c && c<=0xff9f)) {
				len++;
			}
			else {
				len+=2;
			}
		}
		return len;
	}
	
	function OperationAvalible() {
		var that = this;
		var curTime = new Date().getTime();
		if (that.timeTalkOperation > curTime) {
			return false;
		}
		that.timeTalkOperation = curTime + 1200;
		return true;
	}
	
	function Logcat(message) {
		if (gThis != null && gThis.isLogcat)
		{
			console.log("[anyRTC]: ", message);
		}
	}
	
	//判断输入字符串是否为空或者全部都是空格
	function IsNull( str ) {
		if ( str == null ) return true;
		if ( str == undefined ) return true;
		if ( str == "" ) return true;
		var regu = "^[ ]+$";
		var re = new RegExp(regu);
		return re.test(str);
	}
	
	function NotifyError(that, methodName, errMsg) {
		/**
		 * @errorMethodName   错误的方法名称
		 * @errorMethodMsg    错误消息提示
		 */
		that.emit('onSDKError', methodName, {
			msg: errMsg
		});
	}

	/**********************************************************/
	/*                                                        */
	/*                      信道建立部分                       */
	/*                                                        */
	/**********************************************************/

	/*******************基础部分*********************/
  	/**
   	*  实例化对讲组对象
   	*/
	function RTMaxKit() {
		gThis = this;
		if (!(this instanceof RTMaxKit)) return new RTMaxKit();
		//远程地址
		var ishttps = 'https:' == document.location.protocol ? true: false;
		if (ishttps) {
			this.url = "https://www.teameeting.cn";
		}
		else {
			this.url = "http://cloud.anyrtc.io:9091";
		}

		//
		var that = this;

		this.isLogcat = true;
		this.videoMode = "RTCTalk_Videos_LOW";
		this.defaultConstraints = {
			needCamera: true,
			needMicrophone: true
		};
		this.isJustAudio = false;
		this.isTalkApplying = false;
		this.isTalkOn = false;
		this.isTalkP2P = false;
		this.isPublished = false;
		this.networkRetry = 0;
		this.timeTalkOperation = 0;
		this.timeTalkRelease = 0;
		this.timeTalkP2pRelease = 0;
    this.offLineHandler = function () {
        Logcat("Network disconnected.");
        XMLHttp.queueClear();
        that.my_id = "";
        that.isTalkApplying = false;
        that.isTalkOn = false;
        that.isTalkP2P = false;
        that.isPublished = false;
        that.timeTalkOperation = 0;
        that.callId = "";
        that.callType = 0;
        that.callTypeMap = {};
        that.anyRTC.destroyAll();
        //监听网络断网
        window.removeEventListener('offline', that.offLineHandler, true);
        // 断网
        that.emit("onRTCLeaveTalkGroup", 101/*AnyRTC_NET_DISSCONNECT*/);
    };

		//房间ID
		this.anyrtcId = "";
		this.devId = "";
		this.appId = "";
		this.appKey = "";
		this.appToken = "";
		this.appCode = "";
		this.Domain = "";
		//
		this.userId = "";
		this.userData = "";
		// Call信息
		this.callId = "";
		this.callType = 0;
		this.callTypeMap = {};

		//自己的ID，由后服务器创建
		this.my_id = "";
		this.my_rtcPeerId = "";
		this.seqn = 0;
		this.anyRTC = new AnyRTC();
		// 记录pubId对应的rtcPeerID
		this.pubChanId = null;
		this.pubRtcOptType = {};    // 记录pubId对应的类型
		this.pubRtcPeerID = {};     // 记录pubId对应的rtcPeerID
		this.pubRtcUserdata = {};   // 记录pubId对应的userData
		this.pubRender = {};

		//
		this.version = "v2.2.4";
		//
		var request = null;
		var hangingGet = null;

		/*************************Callback部分***************************/
		this.anyRTC.on('stream_created', function (stream, dVideoRender) {
			that.localStream = stream;

			that.emit("onSetLocalVideoCapturerResult", 0, dVideoRender, stream);
		});
		this.anyRTC.on('stream_create_error', function (nErrorCode) {
			that.emit("onSetLocalVideoCapturerResult", nErrorCode);
		});
		// this.anyRTC.on('onRemoteStream', function (stream, pubId) {
		// 	var rtcPeerID = "";
		// 	for(var pid in that.pubRtcPeerID) {
		// 		if (pid == pubId) {
		// 			rtcPeerID = that.pubRtcPeerID[pid];
		// 			break;
		// 		}
		// 	}
		// 	/**
		// 	 *	返回pubId对应的eperId
		// 	 */
		// 	// that.emit('onRTCRemoteStream', stream, rtcPeerID);   //单人双流，使用rtcPeerID会导致只能显示一路流（id容器重复）
		// 	that.emit('onRTCRemoteStream', stream, pubId);
		// });
		this.anyRTC.on('onRemoteVideoStream', function (stream, pubId) {
			var videoStream = stream.clone();
			var video = document.createElement('video');
			video.setAttribute("autoplay", "");
			video.setAttribute("playsinline", "");
			video.setAttribute("muted", "");
			video.muted = true;
			video.style.width = "100%";
			video.style.width = "100%";
			video.style.height = "100%";
			video.srcObject = videoStream;
			video.addEventListener("loadedmetadata", function () {
	          if (this.videoWidth > this.videoHeight) {
	            video.style.objectFit = "cover";
	            video.style.height = "auto";
	          }
	        });
	        
			that.pubRender[pubId] && that.pubRender[pubId].appendChild(video);
		});
		this.anyRTC.on('onRemoteAudioStream', function (stream, pubId) {
			var videoStream = stream.clone();
			var audio = document.createElement('audio');
			audio.setAttribute("autoplay", "");
			audio.setAttribute("playsinline", "");
			audio.srcObject = videoStream;

			that.pubRender[pubId] && that.pubRender[pubId].appendChild(audio);
		});
		this.anyRTC.on('onSendToPeer', function (chanId, jstr) {
			that.sendToPeer(chanId, jstr);
		});
		this.anyRTC.on("onMemberJoin", function (pubId) {
			// var dRander;

			// if (pubId[4] === '1') {
			// 	dRander = document.createElement('audio');
			// } else {
			// 	dRander = document.createElement('video');
			// }

			// dRander.style.width = 'auto';
			// dRander.style.height = '100%';
			// dRander.autoplay = 'autoplay';

			var dRander = document.createElement("div");
			dRander.style.position = "relative";
			dRander.style.width = "100%";
			dRander.style.height = "100%";
			that.pubRender[pubId] = dRander;

			var rtcPeerID = "";
			for(var pid in that.pubRtcPeerID) {
				if (pid == pubId) {
					rtcPeerID = that.pubRtcPeerID[pid];
					break;
				}
			}
			var rtcUserData = "";
			for(var pid in that.pubRtcUserdata) {
				if (pid == pubId) {
					rtcUserData = that.pubRtcUserdata[pid];
					break;
				}
			}
			/**
			 *	返回pubId对应的eperId
			 */
			var optType = that.pubRtcOptType[pubId];
			if (optType == undefined) {
				optType = 0;
			}
			that.emit('onRTCOpenVideoRender', pubId, that.pubRender[pubId], rtcUserData, optType); // strUserData
		});
		this.anyRTC.on("onMemberLeave", function (pubId) {
			var rtcPeerID = "";
			for(var pid in that.pubRtcPeerID) {
				if (pubId == pid) {
					rtcPeerID = that.pubRtcPeerID[pid];
					break;
				}
			}

			delete that.pubRender[pubId];

      /**
			 *	返回pubId对应的eperId
			 */
			var optType = that.pubRtcOptType[pubId];
			if (optType == undefined) {
				optType = 0;
			}
			/**
			 *	返回pubId对应的peerId
			 */
			that.emit('onRTCCloseVideoRender', pubId, optType);
		});

		/*************************内部Function部分***************************/
		this.doJoin = function () {
			try {
				that.request = new XMLHttpRequest();
				var request = that.request;
				request.onreadystatechange = function () {
					try {
						if (request.readyState == 4) {
							if (request.status == 200) {
								var jsResp = JSON.parse(request.responseText);
								if (jsResp.Code == 200) {
									that.my_id = jsResp.DyncID;
									that.startHangingGet();
									request = null;
                  
                  //监听网络断网
                  window.addEventListener('offline', that.offLineHandler, true);
								}
								else {
									/**
									 * 加入对讲组失败
									 * @nCode 错误码
									 * 说明：switchTalkGroup失败也走此回调
									 */
									that.emit('onRTCJoinTalkGroupFailed', jsResp.Code );
								}
							} else {
								/**
								 * 加入对讲组失败
								 * @nCode 错误码
								 * 说明：switchTalkGroup失败也走此回调
								 */
								that.emit('onRTCJoinTalkGroupFailed', 100);
							}
						}
					} catch (e) {
						Logcat("Error: " + e.description + " e: " + e);
						/**
						 * 加入对讲组失败
						 * @nCode 错误码
						 * 说明：switchTalkGroup失败也走此回调
						 */
						that.emit('onRTCJoinTalkGroupFailed', 100);
					}
				};
				var formData = {
					UserID: that.userId,
					UserData: that.userData,
					Domain: that.Domain
				};

				if(that.appCode != null && that.appCode.length > 0)
				{
					request.open("POST", that.url + "/anyapi/v1/connect?DeveloperID=" + that.devId + "&AppID="+that.appId+"&AnyrtcID="+that.anyrtcId
						+"&AppCode="+that.appCode+"&Type=talk", false);
				}
				else
				{
					request.open("POST", that.url + "/anyapi/v1/connect?DeveloperID=" + that.devId + "&AppID="+that.appId+"&AnyrtcID="+that.anyrtcId
						+"&Key="+that.appKey+"&Token="+that.appToken+"&Type=talk", false);
				}
				
				request.send(JSON.stringify(formData));
			} catch (e) {
				Logcat("2 error: " + e.description + " e: " + e);
			}
		};

		this.doPublish = function (mediaType, pubSyncID) {
			if (that.my_id != "") {
				that.isPublished = true;
				
				XMLHttp.queueReq("GET", that.url + "/anyapi/v1/dopublish?DyncID=" + that.my_id + "&Type="+ mediaType +"&AnyrtcID=" + that.anyrtcId + "&PubSyncID=" + pubSyncID, null, function (obj) {
				});
			}
		};
		
		this.doUnPublish = function (strChanId) {
			that.anyRTC.destroyPublisher(strChanId);
			if (that.my_id != "") {
				that.isPublished = false;
				XMLHttp.queueReq("GET", that.url + "/anyapi/v1/dounpublish?DyncID=" + that.my_id + "&ChanID="+ strChanId +"&AnyrtcID=" + that.anyrtcId, null, function (obj) {
				});
			}
		};

		this.doSubscribe = function (pubId, rtcPeerID, rtcUserData, optType) {
			if (that.my_id != "") {
				if (optType == undefined) {
					optType = 0;
				}
				that.pubRtcOptType[pubId] = optType;
				that.pubRtcPeerID[pubId] = rtcPeerID;
				that.pubRtcUserdata[pubId] = rtcUserData;
				
				XMLHttp.queueReq("GET", that.url + "/anyapi/v1/dosubscribe?DyncID=" + that.my_id + "&PubID=" + pubId + "&AnyrtcID=" + that.anyrtcId, null, function (obj) {
				});
			}
		};

		this.doUnSubscribe = function (pubId) {
			var chanId = that.anyRTC.destroySubscriber(pubId);
			delete that.pubRtcOptType[pubId];
			delete that.pubRtcPeerID[pubId];
			delete that.pubRtcUserdata[pubId];
			
			if(chanId != null && chanId != undefined && chanId.length > 0)
			{
				XMLHttp.queueReq("GET", that.url + "/anyapi/v1/dounsubscribe?DyncID=" + that.my_id + "&ChanID=" + chanId, null, function (obj) {
				});
			}
		};

		this.sendToPeer = function (chanId, data) {
			XMLHttp.queueReq("POST", that.url + "/anyapi/v1/sdpinfo?DyncID=" + that.my_id + "&ChanID=" + chanId, data, function (obj) {
			});
		};

		this.startHangingGet = function () {
			if (that.hangingGet != null || that.hangingGet != undefined) return;
			try {
				that.hangingGet = new XMLHttpRequest();
				var hangingGet = that.hangingGet;
				hangingGet.timeout = 60000;
				hangingGet.onreadystatechange = function () {
					try {
						if (hangingGet.readyState != 4) return;
						if (hangingGet.status != 200) {
							if (hangingGet.status == 0) {// Timeout
								if (that.hangingGet) {
									that.hangingGet.abort();
									that.hangingGet = null;
								}
								if (that.my_id != "") {
									window.setTimeout(that.startHangingGet(), 10);
								}
								that.networkRetry = 0;
							} else {
								if(that.networkRetry >= 3)
								{
									that.hangingGet = null;
									Logcat("Network disconnected.");
									XMLHttp.queueClear();
									that.my_id = "";
									that.isTalkApplying = false;
									that.isTalkOn = false;
									that.isTalkP2P = false;
									that.isPublished = false;
									that.timeTalkOperation = 0;
									that.callId = "";
									that.callType = 0;
									that.callTypeMap = {};
									that.anyRTC.destroyAll();
									that.emit("onRTCLeaveTalkGroup", 101/*AnyRTC_NET_DISSCONNECT*/);
								} 
								else 
								{
									if (that.my_id != "") {
										window.setTimeout(that.startHangingGet(), 10);
									}
									that.networkRetry ++;
								}
							}
						} else {
							var jsResp = JSON.parse(hangingGet.responseText);
							if (jsResp.Code != undefined && jsResp.Code != 0) {//"{"Code":-1, "Info":"DyncID not found!"}"
								if (that.my_id != "") {
									Logcat("Talk disconnected.");
									XMLHttp.queueClear();
									that.my_id = "";
									that.isTalkApplying = false;
									that.isTalkOn = false;
									that.isTalkP2P = false;
									that.isPublished = false;
									that.timeTalkOperation = 0;
									that.callId = "";
									that.callType = 0;
									that.callTypeMap = {};
									that.anyRTC.destroyAll();
									/**
									 * 离开对讲组回调
									 * @nCode 错误码 0：正常退出；100：网络错误；101: 网络断开；207：强制退出
									 */

									that.emit("onRTCLeaveTalkGroup", 101/*AnyRTC_NET_DISSCONNECT*/);
								}
								return;
							}
							if (jsResp.Msgs != undefined) {
								var jsMsgs = jsResp.Msgs;
								for (var i = 0; i < jsMsgs.length; i++) {
									//Logcat(jsMsgs[i]);
									var jMsg = JSON.parse(jsMsgs[i]);
									if (jMsg.Seqn <= that.seqn) {
										continue;
									}
									that.seqn = jMsg.Seqn;
									/**
									DC_MESSAGE = 1001,
									DC_PUBLISH,
									DC_UNPUBLISH,
									DC_SUBSCRIBE,
									DC_UNSUBSCRIBE,
									DC_SDP_INFO,
									*/
									if (jMsg.Cmd == 1001) {

									}
									else if (jMsg.Cmd == 1002) {//DC_PUBLISH
										if (jMsg.Params.Result == "ok") {
											that.pubChanId = jMsg.Params.ChanId;
											if (that.isPublished) {
												that.anyRTC.createPublisher(jMsg.Params.ChanId, jMsg.Params.DyncerId);
											}
											else {
												that.doUnPublish(that.pubChanId);
												that.pubChanId = null;
											}
										}
										else {

										}
									}
									else if (jMsg.Cmd == 1003) {//DC_UNPUBLISH

									}
									else if (jMsg.Cmd == 1004) {//DC_SUBSCRIBE							
										var pubId = jMsg.Params.PubId;
										if (jMsg.Params.Result == "ok") {
											if(that.pubRtcOptType[pubId] != undefined)
											{
												var jsBody = JSON.parse(jMsg.Body);
												that.anyRTC.createSubscriber(jMsg.Params.ChanId, jMsg.Params.PubId, jsBody);
											} else {
												XMLHttp.queueReq("GET", that.url + "/anyapi/v1/dounsubscribe?DyncID=" + that.my_id + "&ChanID=" + jMsg.Params.ChanId, null, function (obj) {
												});
											}
										}
										else {
											console.log("Subscribe failed: " + jMsg.Params.Result);
											delete that.pubRtcOptType[pubId];
											delete that.pubRtcPeerID[pubId];
											delete that.pubRtcUserdata[pubId];
										}
									}
									else if (jMsg.Cmd == 1005) {//DC_UNSUBSCRIBE

									}
									else if (jMsg.Cmd == 1006) {//DC_SDP_INFO
										var chanId = jMsg.Params.ChanId;
										that.anyRTC.getSdpInfo(chanId, jMsg.Body);
									}
									else if (jMsg.Cmd == 1007) {//DC_PUBLISH_EX
										if (jMsg.Params.Result == "ok") {
											that.anyRTC.createPublisherEx(jMsg.Params.ChanId);
											that.setUserShareInfo(jMsg.Params.DyncerId);
										}
										else {

										}
									}
									else if (jMsg.Cmd == 1008) {//DC_UNPUBLISH_EX

									}
									/**
									// Talking
									DC_JOIN_TALK = 6001,
									DC_NOTIFY_TALK,
									DC_LEAVE_TALK,
									*/
									else if (jMsg.Cmd == 6001) {// DC_JOIN_TALK
										Logcat(" JoinTalk callback => " + jMsg.Params.Result);
										if (jMsg.Params.Result == "ok") {
											var jsBody = JSON.parse(jMsg.Body);
											that.my_rtcPeerId = jsBody.RtcPeerID;
											/**
											 * 加入对讲组成功回调
											 * @strGroupId	对讲组ID
											 * 说明：switchTalkGroup成功也走此回调
											 */
											that.emit('onRTCJoinTalkGroupOK', that.anyrtcId);

											var jsPubers = jsBody.Pubers;
											if (jsPubers.length > 0) {
												for(var i = 0; i < jsPubers.length; i++) {
													var pubId = jsPubers[i];
													that.doSubscribe(pubId, jsBody.RtcPeersID[i], jsBody.RtcCustomData[i], jsBody.OptTypes[i]);
												}
											}

											var jsPeers = jsBody.RtcPeersID,
											jsPeersAudio = jsBody.PubersAudio,
											jsPeersVideo = jsBody.PubersVideo;

											if (jsPeers.length > 0) {
												for(var i = 0; i < jsPeers.length; i++) {
													var peerId = jsPeers[i], chanId;

													for (var j in that.pubRtcPeerID) {
														if (that.pubRtcPeerID[j] == peerId) {
															chanId = j;
														}
													}
													/**
													 * 用户的音视频状态回调
													 * @strPeerId		 用户的id
													 * @bAudioEnable 音频状态
													 * @bVideoEnable 视频状态
													 */
													that.emit("onRTCAVStatus", chanId, jsPeersAudio[i], jsPeersVideo[i]);
												}
											}
										}
										else {
											that.emit('onRTCJoinTalkGroupFailed', -1);	//*系统出错
										}
									}
									else if (jMsg.Cmd == 6002) {// DC_NOTIFY_TALK
										if (jMsg.Body == null || jMsg.Body.length == 0) {
											jMsg.Body = '{"CMD":"NULL"}';
										}
										var jsBody = JSON.parse(jMsg.Body);
										if(jsBody.CMD == "AskTalkStatus") {
											XMLHttp.queueReq("GET", that.url + "/anyapi/v1/talk_status?DyncID=" + that.my_id + "&AnyrtcID=" + that.anyrtcId + "&Status=" + (that.isTalkOn?1:0), null, function (obj) {
												});
										}
										else if (jsBody.CMD == "Publish") {
											if (jsBody.Publish == true) {
												var mediaType = 1;	//* Force to audio
												if (jsBody.MediaType != undefined) {
													mediaType = jsBody.MediaType;
												}
												var strPubSyncId = "";
												if(jsBody.SyncId != undefined)
												{
													strPubSyncId = jsBody.SyncId;
												}
												that.doPublish(mediaType, strPubSyncId);
											}
											else {
												that.isPublished = false;
												if (that.pubChanId != null) {
													that.doUnPublish(that.pubChanId);
													that.pubChanId = null;
												}
											}
										}
										else if (jsBody.CMD == "Subscribe") {
											if (jsBody.Subscribe == true) {
												var bNeedSub = true;
												if (jsBody.ExRtcPeerID != undefined) {
													for(var i = 0; i < jsBody.ExRtcPeerID.length; i++) {
														if (that.my_rtcPeerId == jsBody.ExRtcPeerID[i]) {
															bNeedSub = false;
															break;
														}
													}
												}
												if (bNeedSub) {
													that.doSubscribe(jsBody.Puber, jsBody.RtcPeerID, jsBody.RtcUserData, jsBody.OptType);
												}
											}
											else {
												that.doUnSubscribe(jsBody.Puber);
											}
										}
										else if (jsBody.CMD == "ReSubscribe") {
											if (jsBody.UnSubscribe != undefined && jsBody.UnSubscribe.length > 0) {
												that.doUnSubscribe(jsBody.UnSubscribe, jsBody.OptType);
											}
											
											if (jsBody.Subscribe != undefined && jsBody.Subscribe.length > 0) {
												that.doSubscribe(jsBody.Subscribe, jsBody.RtcPeerID, "{}");
											}
										}
										else if (jsBody.CMD == "UserMsg") {
											/**
											 *  收到消息回调                  普通消息
											 *  @params strUserId           游客在开发者平台的userid     UserName就是strUserId
											 *  @params strUserName         游客在开发者平台的userid
											 *  @params strUserHeaderUrl    游客在开发者平台的userid
											 *  @params strMessage          游客申请连麦时带过来的自定义参数体（可查看游客端申请连麦参数）
											 **/
											 that.emit("onRTCUserMessage", jsBody.UserName, jsBody.NickName, (jsBody.HeaderUrl == undefined ? "" : jsBody.HeaderUrl), jsBody.Content);
										}
										else if (jsBody.CMD == "AVSetting") {
											var chanId = null;

											for (var k in that.pubRtcPeerID) {
												if (that.pubRtcPeerID[k] == jsBody.RtcPeerID) {
													chanId = k;
												}
											}
											if(jsBody.PeerUserId != undefined)
											{
												/**
												 * 用户的音视频状态回调
												 * @strPeerId		 用户的id
												 * @bAudioEnable 音频状态
												 * @bVideoEnable 视频状态
												 */
												that.emit("onRTCAVStatus", jsBody.PubID, jsBody.AudioEnable, jsBody.VideoEnable);
											}
											else{
												/**
												 *  用户的音视频状态回调
												 *  @params strPeerId           游客在开发者平台的userid     UserName就是strUserId
												 *  @params bAudioEnable        音频是否打开
												 *  @params bVideoEnable        视频是否打开
												 **/
												that.emit("onRTCAVStatus", chanId, jsBody.AudioEnable, jsBody.VideoEnable);
											}
										}
										else if (jsBody.CMD == "TalkApply") {
											Logcat(" TalkApply callback => " + jsBody.Code);
											if (jsBody.Code == 0) {
												if (that.isTalkApplying) {
													that.isTalkApplying = false;
													that.isTalkOn = true;
													/**
													 * 申请对讲成功回调
													 */
													that.emit("onRTCApplyTalkOk");
												}
											}
											else {
												that.isTalkOn = false;
												that.isTalkApplying = false;
												/**
												 *  结束对讲回调
												 *  @params nCode							错误码 0：正常退出对讲；其他参考错误码
												 *  @params strUserId         用户id
												 *  @params strUserData       自定义用户数据
												 * 其他人结束对讲或发起对讲失败的回调。
												 **/
												that.emit("onRTCTalkClosed", jsBody.Code);
												//that.releaseStream();
											}
										}
										else if (jsBody.CMD == "TalkCancel") {
											Logcat(" TalkCancel callback => " + jsBody.UserId);
											var strUserId = jsBody.UserId;
											var strUserData = jsBody.UserData;
											if (that.isTalkOn) {
												that.isTalkOn = false;
												that.isTalkApplying = false;
												/**
												 *  结束对讲回调
												 *  @params nCode							错误码 0：正常退出对讲；811：麦被释放
												 *  @params strUserId         用户id
												 *  @params strUserData       自定义用户数据
												 * 
												 * 其他人结束对讲或发起对讲失败的回调。
												 **/
												that.emit("onRTCTalkClosed", 811/*RTCTalk_BREAKED*/, strUserId, strUserData);
												//that.releaseStream();
											}
										}
										else if (jsBody.CMD == "NotifyOnTalk") {
											Logcat(" NotifyOnTalk callback => " + jsBody.UserId);
											var strRtcPeerID = jsBody.RtcPeerID;
											var strUserId = jsBody.UserId;
											var strUserData = jsBody.UserData;
											if (that.my_rtcPeerId != strRtcPeerID) {
												if (that.isTalkOn) {
													that.isTalkOn = false;
													that.isTalkApplying = false;
													/**
													 *  结束对讲回调
													 *  @params nCode							错误码 0：正常退出对讲；810：麦被抢走了
													 *  @params strUserId         用户id
													 *  @params strUserData       自定义用户数据
													 * 
													 * 其他人结束对讲或发起对讲失败的回调。
													 **/
													that.emit("onRTCTalkClosed", 810/*RTCTalk_ROBBED*/, strUserId, strUserData);
													//that.releaseStream();
												}
												/**
												 *  其他人正在对讲组中讲话回调
												 *  @params strUserId         用户id
												 *  @params strUserData       自定义用户数据
												 **/
												that.emit("onRTCTalkOn", strUserId, strUserData);
											}
										}
										else if (jsBody.CMD == "NotifyOffTalk") {
											Logcat(" NotifyOffTalk callback => " + jsBody.UserId);
											var strUserId = jsBody.UserId;
											var strUserData = jsBody.UserData;
											/**
											 *  结束对讲回调
											 *  @params nCode							错误码 0：正常退出对讲；810：麦被抢走了
											 *  @params strUserId         用户id
											 *  @params strUserData       自定义用户数据
											 * 
											 * 其他人结束对讲或发起对讲失败的回调。
											 **/
											that.emit("onRTCTalkClosed", 0/*OK*/, strUserId, strUserData);
											//that.releaseStream();
										}
										else if (jsBody.CMD == "TalkP2P") {
											Logcat("TalkP2P callback");
											if (jsBody.Enable != undefined) {//被强插
												if (jsBody.Enable) {
													that.isTalkP2P = true;
                          /**
													 *  强制发起P2P通话成功回调
													 **/
													that.emit("onRTCTalkP2POk", jsBody.UserData ? jsBody.UserData : "{}");
												} else {
													if (that.isTalkP2P) {
														that.isTalkP2P = false;
                            /**
														 * 结束P2P通话回调
														 **/
														that.emit("onRTCTalkP2PClosed", 0, jsBody.UserData ? jsBody.UserData : "{}");
													}
												}
											} else {//主动强插
												if (jsBody.Code == 0) {
													/**
													 *  强制发起P2P通话成功回调
													 * @UserData 发起用户的自定义用户数据
													 **/
													that.emit("onRTCTalkP2POk", jsBody.UserData ? jsBody.UserData : "{}");
												}
												else {
													that.isTalkP2P = false;
													/**
													 * 结束P2P通话回调
													 **/
													that.emit("onRTCTalkP2PClosed", jsBody.Code, jsBody.UserData ? jsBody.UserData : "{}");
												}
											}
										}
										else if (jsBody.CMD == "TalkP2PClose") {
											Logcat("onRTCTalkP2PClosed");
											that.isTalkP2P = false;
											that.isTalkOn = false;
											/**
											 * 结束P2P通话回调
											 **/
											that.emit("onRTCTalkP2PClosed", jsBody.Code, jsBody.UserData ? jsBody.UserData : "{}");
										}
										else if (jsBody.CMD == "SwitchGrp") {
											that.emit("onRTCLeaveTalkGroup", 0/*正常*/);
											that.emit('onRTCJoinTalkGroupOK', jsBody.GrpId);
										}
										else if (jsBody.CMD == "VideoMonitorClose") {//* 视频调用成功之后才会有Close回调
											Logcat("onRTCVideoMonitorClose => " + jsBody.UserId);
											/**
											 * 监看端收到被监看端拒绝或关闭监看
											 * @strUserId	
											 * 如果是监看端主动关闭则回调‘onRTCCloseVideoRender’
											 **/
											that.emit("onRTCVideoMonitorClose", jsBody.UserId, jsBody.UserData ? jsBody.UserData : "{}");
										}
										else if (jsBody.CMD == "VideoMonitorResult") {
                      Logcat("onRTCVideoMonitorResult => " + jsBody.Code);
											/**
											 * 发起视频监看结果回调
											 * @strUserId
											 * @nCode
											 **/
											that.emit("onRTCVideoMonitorResult", jsBody.Code, jsBody.UserId, jsBody.UserData ? jsBody.UserData : "{}");
										}
										else if (jsBody.CMD == "VideoReport") {
											Logcat("onRTCVideoReport => " + jsBody.UserId);
											/**
											 * 收到视频上报请求回调
											 * @strUserId	
											 * @strUserData 发起人的用户自定义数据, 可以为```JSON```字符串，小于512字节
											 * 
											 * 用户上报之后并且主动监看用户之后，必须由上报端取消上报，接受上报端无法结束上报操作。
											 **/
											that.emit("onRTCVideoReport", jsBody.UserId, jsBody.UserData);
										}
										else if (jsBody.CMD == "VideoReportClose") {
											Logcat("onRTCVideoReportClose => " + jsBody.UserId);
											/**
											 * 收到视频上报结束回调
											 * @strUserId	
											 **/
											that.emit("onRTCVideoReportClose", jsBody.UserId);
										}
										else if (jsBody.CMD == "MakeCall") {
											//* 被叫者收到
											Logcat("onRTCMakeCall callId=> " + jsBody.CallId);
											that.callTypeMap[jsBody.CallId] = jsBody.CallType;
											/**
											 * 被叫方收到通话请求回调 （呼叫、邀请）
											 * @strCallId
											 * @strCallType
											 * @strUserId
											 * @strUserData 发起人的用户自定义数据, 可以为```JSON```字符串，小于512字节
											 **/
											that.emit("onRTCMakeCall", jsBody.CallId, jsBody.CallType, jsBody.UserId, jsBody.UserData);
										}
										else if (jsBody.CMD == "EndCall") {
											//* 被叫者收到
											Logcat("onRTCEndCall callId=> " + jsBody.CallId);
											if (that.callId.length > 0 && that.callId == jsBody.CallId) {
												that.callType = CT_INIT;
												that.callId = "";
											}

											if (that.callTypeMap[jsBody.CallId] != undefined) {
                        /**
                         * 被叫方收到主叫方挂断通话回调
                         * @strCallId
                         * @strCallType
                         * @strUserId
                         * @nCode
                         **/
                        that.emit("onRTCEndCall", jsBody.CallId, that.callTypeMap[jsBody.CallId], jsBody.UserId, jsBody.Code);
												//that.releaseStream();
												delete that.callTypeMap[jsBody.CallId];
											}
										}
										else if (jsBody.CMD == "MakeCallOK") {
											//* 发起者收到
											Logcat("onRTCMakeCallOK callId=> " + jsBody.CallId);
											that.callId = jsBody.CallId;
											that.callTypeMap[jsBody.CallId] = that.callType;
											/**
											 * 主叫方发起通话成功回调
											 * @strCallId
											 **/
											that.emit("onRTCMakeCallOK", jsBody.CallId);
										}
										else if (jsBody.CMD == "AcceptCall") {
											//* 发起者收到
											Logcat("onRTCAcceptCall => " + jsBody.UserId);
											/**
											 * 主叫方收到被叫方同意通话回调
											 * @strCallId
											 **/
											that.emit("onRTCAcceptCall", jsBody.UserId, jsBody.UserData ? jsBody.UserData : "{}");
										}
										else if (jsBody.CMD == "RejectCall") {
											//* 发起者收到
											Logcat("onRTCRejectCall code=> " + jsBody.Code);
											/**
											 * 主叫方收到被叫方拒绝通话回调
											 * @strCallId
											 * @nCode
											 **/
											that.emit("onRTCRejectCall", jsBody.UserId, jsBody.Code, jsBody.UserData ? jsBody.UserData : "{}");
											if (jsBody.Release != undefined) {
												that.callType = CT_INIT;
												/**
												 * 主叫方收到通话结束的回调
												 * @strCallId
												 * 说明：被叫方和被邀请方已全部退出或者主叫方挂断所有参与者
												 **/
												that.emit("onRTCReleaseCall", "");
											}
										}
										else if (jsBody.CMD == "LeaveCall") {
											//* 发起者收到
											Logcat("onRTCLeaveCall => " + jsBody.UserId);
											/**
											 * 主叫方收到被叫方结束通话回调
											 * @strCallId
											 * 说明：被叫方调用leaveCall，主叫方收到结束通话回调
											 **/
											that.emit("onRTCLeaveCall", jsBody.UserId);
										}
										else if (jsBody.CMD == "RleaseCall") {
											//* 发起者收到，需要释放本地资源
											Logcat("onRTCReleaseCall callId=> " + jsBody.CallId);
											if (that.callId.length > 0 && that.callId == jsBody.CallId) {
												that.callType = CT_INIT;
												that.callId = "";
											}

											if (that.callTypeMap[jsBody.CallId] != undefined) {
                        that.emit("onRTCReleaseCall", jsBody.CallId, that.callTypeMap[jsBody.CallId]);
												delete that.callTypeMap[jsBody.CallId];
											}
										}
										else if (jsBody.CMD == "MemberNum") {//
											/**
											 * 当前对讲组在线人数回调
											 * @param nNum 人数总数
											 */
											// that.emit("onRTCMemberNum", jsBody.CallId);
										}
									} 
									else if (jMsg.Cmd == 6003) {// DC_LEAVE_TALK
										if (that.my_id != "") {
											Logcat("Talk leaved.");
											XMLHttp.queueClear();
											that.my_id = "";
											that.isTalkApplying = false;
											that.isTalkOn = false;
											that.isTalkP2P = false;
											that.isPublished = false;
											that.timeTalkOperation = 0;
											that.callId = "";
											that.callType = 0;
											that.callTypeMap = {};
											that.anyRTC.destroyAll();
											that.emit("onRTCLeaveTalkGroup", 208/*AnyRTC_FORCE_EXIT*/);
										}
									}
								}
							}

							if (that.hangingGet) {
								that.hangingGet.abort();
								that.hangingGet = null;
							}
							if (that.my_id != "") window.setTimeout(that.startHangingGet(), 10);
						}
					} catch (e) {
						Logcat("Hanging get error: " + e.description + " e: " + e);
					}
				};
				Logcat("Http " + that.url + "/anyapi/v1/polling?DyncID=" + that.my_id + "&Seqn=" + that.seqn);
				hangingGet.open("GET", that.url + "/anyapi/v1/polling?DyncID=" + that.my_id + "&Seqn=" + that.seqn, true);
				hangingGet.send();
			} catch (e) {
				Logcat("Hanging error " + e.description + " e: " + e);
			}
		};

		this.releaseStream = function () {
			//释放音视频
			that.localStream && that.localStream.getTracks().forEach(function (track) {
				track.stop();
			});
		};
	}

	//继承自事件处理器，提供绑定事件和触发事件的功能
	RTMaxKit.prototype = new EventEmitter();

	RTMaxKit.prototype.genRoomId = function () {
		return Math.random().toString(36).substr(2);
	};

	/**
	*  配置开发者信息
	*  @params strDeveloperId      anyRTC云平台的开发者id
	*  @params strAppId            anyRTC云平台的应用id
	*  @params strAppKey           anyRTC云平台的应用的appKey
	*  @params strAppToken         anyRTC云平台的应用的appToken
	*  @params strDomain           anyRTC云平台的应用的业务域名
	*  API说明                     配置anyRTC云平台开发者信息
	**/
	RTMaxKit.prototype.initEngineWithAnyRTCInfo = function (strDeveloperId, strAppId, strAppKey, strAppToken, strDomain) {
		var that = this;
		if (typeof strDeveloperId !== "string") {
			NotifyError(that, 'initEngineWithAnyRTCInfo', 'type of strDeveloperId is not string.');
			return false;
		}
		if (typeof strAppId !== "string") {
			NotifyError(that, 'initEngineWithAnyRTCInfo', 'type of strAppId is not string.');
			return false;
		}
		if (typeof strAppKey !== "string") {
			NotifyError(that, 'initEngineWithAnyRTCInfo', 'type of strAppKey is not string.');
			return false;
		}
		if (typeof strAppToken !== "string") {
			NotifyError(that, 'initEngineWithAnyRTCInfo', 'type of strAppToken is not string.');
			return false;
		}
		if (typeof strDomain !== "string") {
			NotifyError(that, 'initEngineWithAnyRTCInfo', 'type of strDomain is not string.');
			return false;
		}

		that.devId = strDeveloperId;
		that.appId = strAppId;
		that.appKey = strAppKey;
		that.appToken = strAppToken;
		that.Domain = strDomain;
		
		return true;
	};
	RTMaxKit.prototype.initEngineWithAppCode = function (strDeveloperId, strAppId, strAppCode, strDomain) {
		var that = this;
		if (typeof strDeveloperId !== "string") {
			NotifyError(that, 'initEngineWithAnyRTCInfo', 'type of strDeveloperId is not string.');
			return false;
		}
		if (typeof strAppId !== "string") {
			NotifyError(that, 'initEngineWithAnyRTCInfo', 'type of strAppId is not string.');
			return false;
		}
		if (typeof strAppCode !== "string") {
			NotifyError(that, 'initEngineWithAnyRTCInfo', 'type of strAppCode is not string.');
			return false;
		}
		if (typeof strDomain !== "string") {
			NotifyError(that, 'initEngineWithAnyRTCInfo', 'type of strDomain is not string.');
			return false;
		}

		that.devId = strDeveloperId;
		that.appId = strAppId;
		that.appCode = strAppCode;
		that.Domain = strDomain;
		
		return true;
	};

	/**
	*  配置私有云
	*  @params strAddress      私有云服务地址
	*  @params nPort           私有云服务端口
	*  API说明                 配置私有云信息。当使用私有云时才需要调用该接口配置，默认不需要配置。
	**/
	RTMaxKit.prototype.configServerForPriCloud = function (strAddress, nPort) {
		var that = this;

		if (typeof strAddress !== "string") {
				NotifyError(that, 'configServerForPriCloud', 'type of strAddress is not string.');
				return false;
		}

		var ishttps = 'https:' == document.location.protocol ? true : false;
		if (ishttps) {
			if (nPort) {
        if (typeof nPort !== "number") {
            NotifyError(that, 'configServerForPriCloud', 'type of nPort is not number.');
            return false;
        }
				that.url = "https://" + strAddress + ":" + nPort;
			} else {
				that.url = "https://" + strAddress;
			}
		} else {
			if (nPort) {
        if (typeof nPort !== "number") {
            NotifyError(that, 'configServerForPriCloud', 'type of nPort is not number.');
            return false;
        }
				that.url = "http://" + strAddress + ":" + nPort;
			} else {
				that.url = "http://" + strAddress;
			}
		}
	};

	/**
	 *  设置视频对讲组质量
	 *  @params strVideoMode       RTMPC_Video_SD | RTMPC_Video_HD
	 *  参数说明：
	 *  RTCTalk_Videos_HD   1080*720    1024 kbps   1080P
	 *  RTCTalk_Videos_QHD  960*540     768 kbps    720P
	 *  RTCTalk_Videos_SD   640*480     512 kbps    480P
	 *  RTCTalk_Videos_LOW  352*288     384 kbps    360P
	 **/
	RTMaxKit.prototype.setVideoMode  = function (strVideoMode) {
	 	var that = this;

 		if (typeof strVideoMode !== "string") {
	       NotifyError(that, 'setVideoMode', 'type of strVideoMode is not string.');
	       return false;
	   	}

	   	switch (strVideoMode) {
			case 'RTCTalk_Videos_HD':
				that.VBitrate = 1024;
				that.VWidth = 1280;
				that.VHeight = 720;
			break;
			case 'RTCTalk_Videos_QHD':
				that.VBitrate = 768;
				that.VWidth = 960;
				that.VHeight = 540;
			break;
			case 'RTCTalk_Videos_SD':
				that.VBitrate = 512;
				that.VWidth = 640;
				that.VHeight = 480;
			break;
			case 'RTCTalk_Videos_LOW':
			default:
				that.VBitrate = 384;
				that.VWidth = 352;
				that.VHeight = 288;
				strVideoMode = 'RTCTalk_Videos_LOW';
			break;
	   }

		that.videoMode = strVideoMode;
	   
	   return true;
	};

	/**
	 *  设置对讲组音频模式
	 *  @param 	bAudioOnly
	 *  API说明            设置音频对讲组模式
	 **/
	RTMaxKit.prototype.setAudioModel = function (bAudioOnly) {
	 	var that = this;

	 	if (typeof bAudioOnly !== 'boolean') {
	       	NotifyError(that, 'setAudioModel', 'type of bAudioOnly is not boolean.');
	       	return false;
	   }
	   that.isJustAudio = bAudioOnly;
	   
	   return true;
	};

	/**
	 *  获取SDK版本号
	 *  @return version
	 *  API说明            获取当前SDK版本
	**/
	RTMaxKit.prototype.getSdkVersion = function () {
		return this.version;
	};

	/*************************Function部分***************************/
	/**
	 *  设置本地音频是否传输
	 *  @param bEnable		打开或关闭本地视频
	 *  API说明             设置本地音频是否传输
	**/
	RTMaxKit.prototype.setLocalAudioEnable = function (bEnable) {
		var that = this;

		if (typeof bEnable !== "boolean") {
				NotifyError(that, 'setLocalAudioEnable', 'type of bEnable is not boolean.');
				return false;
		}

		var audioStream = that.localStream.getAudioTracks()[0];
		var videoStream = that.localStream.getVideoTracks()[0];
		if (audioStream) {
			if (bEnable == true) {
				audioStream.enabled = true;
				audioStream.muted = true;
			} else {
				audioStream.enabled = false;
				audioStream.muted = false;
			}

			var jsAvSetting = {"CMD": "AVSetting", "AudioEnable":audioStream.enabled, "VideoEnable":videoStream.enabled };
			XMLHttp.queueReq("POST", that.url + "/anyapi/v1/talk_avsetting?DyncID=" + that.my_id + "&AnyrtcID=" + that.anyrtcId, JSON.stringify(jsAvSetting), function (obj) {});
		} else {
				NotifyError(that, 'setLocalAudioEnable', 'Please open the camera first.');
		}
	};

  	/**
   	 *  设置本地视频是否传输
  	 *  @param bEnable		打开或关闭本地视频
	 *  API说明             设置本地视频是否传输
   	**/
	RTMaxKit.prototype.setLocalVideoEnable = function (bEnable) {
   		var that = this;

      if (that.isJustAudio) {
          NotifyError(that, 'setLocalVideoEnable', 'Audio mode is not allowed enabled local video');
          return false;
      }
   		if (typeof bEnable !== "boolean") {
	       	NotifyError(that, 'setLocalVideoEnable', 'type of bEnable is not boolean.');
       		return false;
   		}

	   	var audioStream = that.localStream.getAudioTracks()[0];
	   	var videoStream = that.localStream.getVideoTracks()[0];
	   	if (videoStream) {
	   		if (bEnable == true) {
	   			videoStream.enabled = true;
	   		} else {
	   			videoStream.enabled = false;
	   		}

	   		var jsAvSetting = {"CMD": "AVSetting", "AudioEnable":audioStream.enabled, "VideoEnable":videoStream.enabled };
	   		XMLHttp.queueReq("POST", that.url + "/anyapi/v1/talk_avsetting?DyncID=" + that.my_id + "&AnyrtcID=" + that.anyrtcId, JSON.stringify(jsAvSetting), function (obj) {});
	   	} else {
	       	NotifyError(that, 'setLocalVideoEnable', 'Please open the camera first.');
	   	}
	};

	/*************************Function部分***************************/
	/**
	 *	设置本地视频采集窗口
	 *  @params DRender     Video视频容器窗口 DOM节点
	 */
	RTMaxKit.prototype.setLocalVideoCapturer = function () {
	 	var that = this;
		var Drender = document.createElement('video');

		if (arguments.length !== 0) {
			if (typeof arguments[0] !== 'object') {
				that.emit('onSDKError', 'setLocalVideoCapturer', {
					msg: 'the first argument is not object.'
				});
				return
			} else {
				if (that.isJustAudio) {//如果是音频会议
					(arguments[0] && arguments[0].needCamera) && (arguments[0].needCamera = false);
					Drender = document.createElement('audio');
				}
				Object.assign(that.defaultConstraints, arguments[0]);
				that.anyRTC.createStream(that.defaultConstraints, that.videoMode, Drender);
			}
		} else {
			if (that.isJustAudio) {//如果是音频会议
				that.defaultConstraints = {
					needCamera: false,
					needMicrophone: true
				}
				Drender = document.createElement('audio');
			}
			that.anyRTC.createStream(that.defaultConstraints, that.videoMode, Drender);
		}
	};

	/**
	 * 设置其他与会者视频窗口
	 * @param stream        RTC视频流
	 * @param dRender 		对方视频的窗口，本地设置
	 * 说明：该方法用于与会者接通后，与会者视频接通回调中（OnRTCOpenVideoRender）使用。
	*/
	RTMaxKit.prototype.setRTCVideoRender = function (stream, dRender) {
		var that = this;
		if (dRender) {
			dRender.srcObject = stream;
		} else {
			NotifyError(that, 'setRTCVideoRender', 'dRender is undefined.');
		}
	};

	/** @deprecated
	 *  加入对讲组
	 *  @param 	strAnyRTCId		对讲组号
	 *  @param 	strUserId		开发者自己平台的Id
	 *  @param 	strUserData		开发者自己平台的相关信息（昵称，头像等），可选。(限制512字节)
	 * 
	 * 切换对讲组成功会收到``` onRTCJoinTalkGroupOK ```回调，失败则收到``` onRTCJoinTalkGroupFailed ```。
	*/
	RTMaxKit.prototype.joinRTC = function (strAnyRTCId, strUserId, strUserData) {
		var that = this;

		if (typeof strAnyRTCId !== "string") {
			/**
			 *  创建RTC服务连接结果
			 *  nCode           错误码 4  参数非法
		 	**/
      		that.emit('onRTCJoinTalkGroupFailed', 4);  // 参数非法
      		
			NotifyError(that, 'joinRTC', 'type of strAnyRTCId is not string.');
			return false;
		}

		that.anyrtcId =  strAnyRTCId;//that.isJustAudio ? "a_" + strAnyRTCId : "v_" + strAnyRTCId;

		if (typeof strUserId !== "string") {
			/**
			 *  创建RTC服务连接结果
			 *  nCode           错误码 4  参数非法
		 	**/
      		that.emit('onRTCJoinTalkGroupFailed', 4);  // 参数非法
      		
			NotifyError(that, 'joinRTC', 'type of strUserId is not string.');
			return false;
		}

		that.userId = strUserId;

		if (typeof strUserData !== "string") {
      		/**
			 *  创建RTC服务连接结果
			 *  nCode           错误码 4  参数非法
			**/
      		that.emit('onRTCJoinTalkGroupFailed', 4);  // 参数非法
      		
			NotifyError(that, 'joinRTC', 'type of strUserData is not string.');
			return false;
		} else {
			if (strlen(strUserData) > 512) {
        		/**
         		 *  创建RTC服务连接结果
         		 *  nCode           错误码 4  参数非法
             **/
        		that.emit('onRTCJoinTalkGroupFailed', 4);  // 参数非法
        		
         		NotifyError(that, 'joinRTC', 'strUserData is out of length.');
         		return false;
     		}
 		}

 		that.userData = strUserData;

		Logcat("Do joinRTC ......");
 		that.doJoin();
		
		return true;
	};

	/**
	 * 加入对讲组
	 * @param strGroupId strGroupId 对讲组id（同一个anyrtc平台的appid内保持唯一性）
	 * @param strUserId 用户的第三方平台的用户id
	 * @param strUserData 用户的自定义数据
	 * @return -1: strGroupId为空; 0：成功，1：失败；2：strUserData 大于512
	 */
	RTMaxKit.prototype.joinTalkGroup = function (strGroupId, strUserId, strUserData) {
		var that = this;

		if (typeof strGroupId !== "string") {
			/**
			 *  创建RTC服务连接结果
			 *  nCode           错误码 4  参数非法
		 	**/
			that.emit('onRTCJoinTalkGroupFailed', 4);  // 参数非法

			NotifyError(that, 'joinRTC', 'type of strGroupId is not string.');
			return false;
		}

		that.anyrtcId = strGroupId;//that.isJustAudio ? "a_" + strAnyRTCId : "v_" + strAnyRTCId;

		if (typeof strUserId !== "string") {
			/**
			 *  创建RTC服务连接结果
			 *  nCode           错误码 4  参数非法
		 	**/
			that.emit('onRTCJoinTalkGroupFailed', 4);  // 参数非法

			NotifyError(that, 'joinRTC', 'type of strUserId is not string.');
			return false;
		}

		that.userId = strUserId;

		if (typeof strUserData !== "string") {
			/**
			 *  创建RTC服务连接结果
			 *  nCode           错误码 4  参数非法
			**/
			that.emit('onRTCJoinTalkGroupFailed', 4);  // 参数非法

			NotifyError(that, 'joinRTC', 'type of strUserData is not string.');
			return false;
		} else {
			if (strlen(strUserData) > 512) {
				/**
					 *  创建RTC服务连接结果
					 *  nCode           错误码 4  参数非法
				**/
				that.emit('onRTCJoinTalkGroupFailed', 4);  // 参数非法

				NotifyError(that, 'joinRTC', 'strUserData is out of length.');
				return false;
			}
		}

		that.userData = strUserData;

		Logcat("Do joinRTC ......");
		that.doJoin();

		return true;
	};
	
	/** @deprecated
	 *  切换对讲组
	 *  @param 	strAnyRTCId		对讲组号
	 * 
	*/
	RTMaxKit.prototype.rejoinRTC = function (strAnyRTCId, strUserData) {
		var that = this;

		if (typeof strAnyRTCId !== "string") {
			/**
			 *  创建RTC服务连接结果
			 *  nCode           错误码 4  参数非法
		 	**/
			that.emit('onRTCJoinTalkGroupFailed', 4);  // 参数非法
      		
			NotifyError(that, 'rejoinRTC', 'type of strAnyRTCId is not string.');
			return false;
		}

		if (typeof strUserData !== "string") {
			/**
			 *  创建RTC服务连接结果
			 *  nCode           错误码 4  参数非法
			**/
				that.emit('onRTCJoinTalkGroupFailed', 4);  // 参数非法
      		
			NotifyError(that, 'rejoinRTC', 'type of strUserData is not string.');
			return false;
		} else {
			if (strlen(strUserData) > 512) {
				/**
				 *  创建RTC服务连接结果
				 *  nCode           错误码 4  参数非法
     			**/
				that.emit('onRTCJoinTalkGroupFailed', 4);  // 参数非法

				NotifyError(that, 'rejoinRTC', 'strUserData is out of length.');
				return false;
			}
 		}
		
		that.cancelTalk();
		
 		that.userData = strUserData;
		
		if (that.my_id != "") {
			Logcat("Do rejoinRTC ......");
     		that.request = new XMLHttpRequest();
     		var request = that.request;
     		request.open("POST", that.url + "/anyapi/v1/talk_switch_grp?DyncID=" + that.my_id + "&AnyrtcID=" + that.anyrtcId + "&GrpID=" + strAnyRTCId, false);
			request.send(that.userData);
     	}
		that.anyrtcId =  strAnyRTCId;
		return true;
	}

	/**
	 * 切换对讲组
	 * @param strGroupId 对讲组id（同一个anyrtc平台的appid内保持唯一性）
	 * @param strUserData strUserData 自定义数据
	 * @return -2：切换对讲组失败，-1：strGroupId为空，0：成功；2：strUserData 大于512字节
	 * 
	 * 切换对讲组成功会收到``` onRTCJoinTalkGroupOK ```回调，失败则收到``` onRTCJoinTalkGroupFailed ```。
	 */
	RTMaxKit.prototype.switchTalkGroup = function (strGroupId, strUserData) {
		var that = this;

		if (typeof strGroupId !== "string") {
			/**
			 *  创建RTC服务连接结果
			 *  nCode           错误码 4  参数非法
		 	**/
			that.emit('onRTCJoinTalkGroupFailed', 4);  // 参数非法

			NotifyError(that, 'rejoinRTC', 'type of strGroupId is not string.');
			return false;
		}

		if (typeof strUserData !== "string") {
			/**
			 *  创建RTC服务连接结果
			 *  nCode           错误码 4  参数非法
			**/
			that.emit('onRTCJoinTalkGroupFailed', 4);  // 参数非法

			NotifyError(that, 'rejoinRTC', 'type of strUserData is not string.');
			return false;
		} else {
			if (strlen(strUserData) > 512) {
				/**
				 *  创建RTC服务连接结果
				 *  nCode           错误码 4  参数非法
     			**/
				that.emit('onRTCJoinTalkGroupFailed', 4);  // 参数非法

				NotifyError(that, 'rejoinRTC', 'strUserData is out of length.');
				return false;
			}
		}

		that.cancelTalk();

		that.userData = strUserData;

		if (that.my_id != "") {
			Logcat("Do rejoinRTC ......");
			that.request = new XMLHttpRequest();
			var request = that.request;
			request.open("POST", that.url + "/anyapi/v1/talk_switch_grp?DyncID=" + that.my_id + "&AnyrtcID=" + that.anyrtcId + "&GrpID=" + strGroupId, false);
			request.send(that.userData);
		}
		that.anyrtcId = strGroupId;
		return true;
	}
	
	/** @deprecated
	 *  离开对讲组
 	*/
	RTMaxKit.prototype.leaveRTC = function () {
		var that = this;
		that.seqn = 0;
		RTMaxKit.prototype.events = {};
     	if (that.my_id != "") {
			Logcat("Do leaveRTC ......");
			that.request = new XMLHttpRequest();
			var request = that.request;
			request.open("GET", that.url + "/anyapi/v1/disconnect?DyncID=" + that.my_id, false);
			request.send();
			that.my_id = "";
			that.isTalkApplying = false;
			that.isTalkOn = false;
			that.isTalkP2P = false;
			that.isPublished = false;
			that.timeTalkOperation = 0;
			that.callId = "";
			that.callType = 0;
			that.callTypeMap = {};
     	}
		//释放音视频
		that.localStream && that.localStream.getTracks().forEach(function (track) {
			track.stop();
		});
		//清除监听事件
		RTMaxKit.prototype.events = {};
		that.anyRTC.destroyAll();
	};

	/**
	 * 退出对讲组
 	*/
	RTMaxKit.prototype.leaveTalkGroup = function () {
		var that = this;
		that.seqn = 0;
		if (that.my_id != "") {
			Logcat("Do leaveRTC ......");
			that.request = new XMLHttpRequest();
			var request = that.request;
			request.open("GET", that.url + "/anyapi/v1/disconnect?DyncID=" + that.my_id, false);
			request.send();
			that.my_id = "";
			that.isTalkApplying = false;
			that.isTalkOn = false;
			that.isTalkP2P = false;
			that.isPublished = false;
			that.timeTalkOperation = 0;
			that.callId = "";
			that.callType = 0;
			that.callTypeMap = {};
		}
		//释放音视频
		that.localStream && that.localStream.getTracks().forEach(function (track) {
			track.stop();
		});
		//清除监听事件
		RTMaxKit.prototype.events = {};
		that.anyRTC.destroyAll();
	};

	/**
	 * 申请对讲
	 * @param nPriority 申请抢麦用户的级别（0权限最大（数值越大，权限越小）；除0以外，可以后台设置0-10之间的抢麦权限大小））
	 * @return 0: 调用OK  -1:未登录  -2:正在对讲中  -3: 资源还在释放中 -4: 操作太过频繁
	 * 
	 * 在对讲组中发言者需申请对讲，申请对讲成功将会收到```onRTCApplyTalkOk```回调，反之收到```onRTCTalkClosed```结束对讲回调。
	 */
	RTMaxKit.prototype.applyTalk = function (nPriority) {
		var that = this;
		if (!OperationAvalible())
		{
			NotifyError(that, 'applyTalk', 'Your operation is frequently, retry later : ).');
			return false;
		}
		
		// 是否获得anyrtc分配的id
		if (that.my_id === null || that.my_id === undefined || that.my_id === "") {
		 	NotifyError(that, 'applyTalk', 'Please try it again after joinRTC success.');
			return false;
		}
		
		if (!IsNull(that.callId) || that.callType != CT_INIT || that.isTalkApplying || that.isTalkOn || that.isTalkP2P)
		{
			NotifyError(that, 'applyTalk', 'There has session is on, release it before applyTalk.');
			return false;
		}
		
		Logcat("Do applyTalk ......");
		that.isTalkApplying = true;
		XMLHttp.queueReq("GET", that.url + "/anyapi/v1/talk_apply?DyncID=" + that.my_id + "&AnyrtcID=" + that.anyrtcId + "&Priority=" + nPriority + "&AskTalkStatus=1", null, function (obj) {});
		
		return true;
	}
	
	/** 
	 * 取消对讲
	 * 申请对讲成功（onRTCApplyTalkOk）之后，主动结束（广播)对讲。
	**/
	RTMaxKit.prototype.cancelTalk = function () {
		var that = this;

		// 是否获得anyrtc分配的id
		if (that.my_id === null || that.my_id === undefined || that.my_id === "") {
			/**
			 * @errorMethodName   错误的方法名称
			 * @errorMethodMsg    错误消息提示
			 */
			NotifyError(that, 'cancelTalk', 'Please try it again after joinRTC success.');
			return false;
		}
		
		if (that.isTalkOn || that.isTalkApplying)
		{
			Logcat("Do cancelTalk ......");
			that.isTalkApplying = false;
			XMLHttp.queueReq("GET", that.url + "/anyapi/v1/talk_cancel?DyncID=" + that.my_id + "&AnyrtcID=" + that.anyrtcId, null, function (obj) {});
		}
		
		if (that.isTalkOn)
		{
			that.isTalkOn = false;
			that.emit("onRTCTalkClosed", 0, that.userId, that.userData);
			//that.releaseStream();
		}
		
		return true;
	}

	/**
	 * 强插对讲
	 * 
	 * 强制与当前正在对讲的用户发起一对一的对讲。不影响对讲组的其他成员对讲。一对一对讲不受对讲组中的其他成员影响，一对一对讲内容也不会影响对讲组中的成员。
	 * 当用户正在对讲时才可强制发起P2P通话,该用户会收到```onRTCTalkP2POn```。
	**/
	RTMaxKit.prototype.talkP2P = function (strPeerUserId, strUserData) {
		var that = this;

		if (!OperationAvalible()) {
			NotifyError(that, 'talkP2P', 'Your operation is frequently, retry later : ).');
			return false;
		}

		// 是否获得anyrtc分配的id
		if (that.my_id === null || that.my_id === undefined || that.my_id === "") {
			NotifyError(that, 'talkP2P', 'Please try it again after joinRTC success.');
			return false;
		}

		if (typeof strPeerUserId !== "string" || strPeerUserId.length == 0) {
			NotifyError(that, 'talkP2P', 'type of strPeerUserId is not string.');
			return false;
		}

		if (typeof strUserData !== "string") {
			NotifyError(that, 'talkP2P', 'type of strUserData is not string.');
			return false;
		} else {
			if (strlen(strUserData) > 512) {
				NotifyError(that, 'talkP2P', 'strUserData is out of length.');
				return false;
			}
		}

		if (!IsNull(that.callId) || that.callType != CT_INIT || that.isTalkApplying || that.isTalkOn || that.isTalkP2P) {
			NotifyError(that, 'talkP2P', 'There has session is on, release it before talkP2P.');
			return false;
		}

		Logcat("Do talkP2P ......");
		that.isTalkP2P = true;
		XMLHttp.queueReq("POST", that.url + "/anyapi/v1/talk_p2p?DyncID=" + that.my_id + "&AnyrtcID=" + that.anyrtcId + "&PeerId=" + strPeerUserId, strUserData, function (obj) {});
		
		return true;
	}

	/** @deprecated
	 *	取消强插对讲
	 *	说明：控制台关闭强插对讲，该用户会收到onRTCTalkP2POff
	**/
	RTMaxKit.prototype.talkP2PClose = function (strPeerUserId) {
		var that = this;
		
		if (!that.isTalkP2P)
		{
			return false;
		}
		
		Logcat("Do talkP2PClose ......");
		that.isTalkP2P = false;
		XMLHttp.queueReq("GET", that.url + "/anyapi/v1/talk_p2p_close?DyncID=" + that.my_id + "&AnyrtcID=" + that.anyrtcId, null, function (obj) {});
		
		return true;
	}
	
	/**
	 *	取消强插对讲
	 *
	 *	结束强插对讲，对方将收到```onRTCTalkP2POff```回调
   *	说明：控制台关闭强插对讲，该用户会收到onRTCTalkP2POff
	**/
	RTMaxKit.prototype.closeP2PTalk = function () {
		var that = this;

		if (!that.isTalkP2P) {
			return false;
		}

		Logcat("Do talkP2PClose ......");
		that.isTalkP2P = false;
		XMLHttp.queueReq("GET", that.url + "/anyapi/v1/talk_p2p_close?DyncID=" + that.my_id + "&AnyrtcID=" + that.anyrtcId, null, function (obj) { });

		return true;
	}

	/**
	 * 打断对讲组的所有对讲
	 * 当用户正在强插时打断对讲不生效
	 * 打断指定对讲组中的对讲，正在发言的人讲被强制结束对讲，不能用于打断强插对讲（因为对讲与强插对讲互不影响）
	**/
	RTMaxKit.prototype.breakTalk = function (strGroupId) {
		var that = this;

		if (!OperationAvalible()) {
			NotifyError(that, 'breakTalk', 'Your operation is frequently, retry later : ).');
			return false;
		}

		// 是否获得anyrtc分配的id
		if (that.my_id === null || that.my_id === undefined || that.my_id === "") {
			NotifyError(that, 'breakTalk', 'Please try it again after joinRTC success.');
			return false;
		}

		Logcat("Do breakTalk ......");
		var strGrpId = "";
		if (strGroupId != undefined && strGroupId != null && typeof strGroupId == "string") {
			strGrpId = strGroupId;
		}
		XMLHttp.queueReq("GET", that.url + "/anyapi/v1/talk_break?DyncID=" + that.my_id + "&AnyrtcID=" + that.anyrtcId + "&GrpID=" + strGrpId, null, function (obj) {});
		
		return true;
	}

	/**
	 * 打断某个用户的通话、对讲、强插对讲
   *	打断通话，包括强插
	 *	通话强拆，比如是A是发起者，B和C是被叫。
	 * 	1，如果我强拆A，则这个会话就结束
	 * 	2，如果我强插B或C，这个会话还会继续，只是B或C退出了而已
	 * 
	 *  打断指定用户的呼叫与强插对讲(P2P)，不能打断对讲(广播)。
	**/
	RTMaxKit.prototype.breakCall = function (strPeerUserId) {
		var that = this;

		if (!OperationAvalible()) {
			NotifyError(that, 'breakCall', 'Your operation is frequently, retry later : ).');
			return false;
		}

		// 是否获得anyrtc分配的id
		if (that.my_id === null || that.my_id === undefined || that.my_id === "") {
			NotifyError(that, 'breakCall', 'Please try it again after joinRTC success.');
			return false;
		}
		if (typeof strPeerUserId !== "string" || strPeerUserId.length == 0) {
			NotifyError(that, 'breakCall', 'type of strPeerUserId is not string.');
			return false;
		}


		Logcat("Do breakCall ......");
		XMLHttp.queueReq("GET", that.url + "/anyapi/v1/talk_break_call?DyncID=" + that.my_id + "&AnyrtcID=" + that.anyrtcId + "&PeerId=" + strPeerUserId, null, function (obj) {});
		
		return true;
	}
	
	/**
	 * 发起通话请求
	 * @strPeerUserId 用户id
	 * @nType 0：视频 1：音频
	 * @strUserData 发起人的用户自定义数据, 可以为```JSON```字符串，小于512字节
	 * 
	 * 主动向用户发起音频呼叫或视频会叫，对方会收到`onRTCMakeCall`回调，当通话被释放(譬如，发起方被`breakCall`，或是当前呼叫方或邀请方均已退出通话)，发起方会收到`onRTCReleaseCall`回调
	**/
	RTMaxKit.prototype.makeCall = function (strPeerUserId, nType, strUserData) {
		var that = this;
		// 是否获得anyrtc分配的id
		if (IsNull(that.my_id)) {
			NotifyError(that, 'makeCall', 'Please try it again after joinRTC success.');
			return false;
		}
		if (IsNull(strPeerUserId)) {
			NotifyError(that, 'makeCall', 'strPeerUserId do not set to null.');
			return false;
		}
		if (nType != 0 && nType != 1)
		{
			NotifyError(that, 'makeCall', 'nType must set to 0 or 1.');
			return false;
		}
		if (!IsNull(that.callId) || that.callType != CT_INIT || that.isTalkApplying || that.isTalkOn || that.isTalkP2P)
		{
			NotifyError(that, 'makeCall', 'There has session is on, release it before makeCall.');
			return false;
		}
		if (typeof strUserData !== "string") {
			NotifyError(that, 'makeCall', 'type of strUserData is not string.');
			return false;
		} else {
			if (strlen(strUserData) > 512) {
         		NotifyError(that, 'makeCall', 'strUserData is out of length.');
         		return false;
     		}
 		}
		if (nType == 0) {
			that.callType = CT_VIDEO;
		}
		else {
			that.callType = CT_AUDIO;
		}
		Logcat("Do makeCall ......");
		XMLHttp.queueReq("POST", that.url + "/anyapi/v1/talk_make_call?DyncID=" + that.my_id + "&AnyrtcID=" + that.anyrtcId + "&PeerId=" + strPeerUserId + "&CType=" + nType, strUserData, function (obj) {});
	
		return true;
	}
	
	/**
	 * 发起通话邀请
	 * 发起通话请求成功之后，方可邀请其他人员加入通话
	 * @strPeerUserId
	 * @strUserData 发起人的用户自定义数据, 可以为```JSON```字符串，小于512字节
	 * 
	 * 发起通话邀请必须建立在发起通话请求成功（通话已建立）的基础上。
	**/
	RTMaxKit.prototype.inviteCall = function (strPeerUserId, strUserData) {
		var that = this;
		// 是否获得anyrtc分配的id
		if (IsNull(that.my_id)) {
			NotifyError(that, 'inviteCall', 'Please try it again after joinRTC success.');
			return false;
		}
		if (IsNull(strPeerUserId)) {
			NotifyError(that, 'inviteCall', 'strPeerUserId do not set to null.');
			return false;
		}
		if (IsNull(that.callId))
		{
			NotifyError(that, 'inviteCall', 'Call session not avalible now, pls wait for a minute.');
			return false;
		}
		if (typeof strUserData !== "string") {
			NotifyError(that, 'inviteCall', 'type of strUserData is not string.');
			return false;
		} else {
			if (strlen(strUserData) > 512) {
         		NotifyError(that, 'inviteCall', 'strUserData is out of length.');
         		return false;
     		}
 		}
		
		Logcat("Do inviteCall ......");
		XMLHttp.queueReq("POST", that.url + "/anyapi/v1/talk_invite_call?DyncID=" + that.my_id + "&AnyrtcID=" + that.anyrtcId + "&PeerId=" + strPeerUserId, strUserData, function (obj) {});
	
		return true;
	}
	
	/**
	 * 主叫方结束某路通话
	 * @strPeerUserId
	 * 
	 * 主叫方结束与某人通话，无论对方是呼叫方还是邀请方，而非leaveCall。
	 * 结束整个通话传callid，结束某一个通话用PeerUserId
	 * 当通话内呼叫方与邀请方均已退出通话（会被`breakCall`强拆），主叫方将会收到`onRTCReleaseCall`回调
	**/
	RTMaxKit.prototype.endCall = function (strPeerUserId) {
		var that = this;
		// 是否获得anyrtc分配的id
		if (IsNull(that.my_id)) {
			NotifyError(that, 'endCall', 'Please try it again after joinRTC success.');
			return false;
		}
		if (IsNull(strPeerUserId)) {
			NotifyError(that, 'endCall', 'strPeerUserId do not set to null.');
			return false;
		}
		
		if (that.callId.length > 0 && that.callId == strPeerUserId) {//结束整个通话传callid，结束某一个通话用PeerUserId
			that.callType = CT_INIT;
			that.emit("onRTCReleaseCall", that.callId);
			delete that.callTypeMap[that.callId];
			that.callId = "";
		}
		//that.releaseStream();
		
		Logcat("Do endCall ......");
		XMLHttp.queueReq("POST", that.url + "/anyapi/v1/talk_end_call?DyncID=" + that.my_id + "&AnyrtcID=" + that.anyrtcId + "&PeerId=" + strPeerUserId, null, function (obj) {});
	
		return true;
	}
	
	/**
	 * 接受通话请求
	 * @strCallId
	 * 
	 * 当收到通话请求（通话请求或者通话邀）时，同意通话请求，建立通话连接
	**/
	RTMaxKit.prototype.acceptCall = function (strCallId) {
		var that = this;
		// 是否获得anyrtc分配的id
		if (IsNull(that.my_id)) {
			NotifyError(that, 'acceptCall', 'Please try it again after joinRTC success.');
			return false;
		}
		if (IsNull(strCallId)) {
			NotifyError(that, 'acceptCall', 'strCallId do not set to null.');
			return false;
		}
		
		if (!IsNull(that.callId) || that.callType != CT_INIT || that.isTalkApplying || that.isTalkOn || that.isTalkP2P)
		{
			NotifyError(that, 'acceptCall', 'There has session is on, release it before acceptCall.');
			that.rejectCall(strCallId);
			return false;
		}
		if (that.callTypeMap[strCallId] == undefined)
		{
			NotifyError(that, 'acceptCall', 'Not found call.');
			return false;
		}
		that.callId = strCallId;
		if (that.callTypeMap[strCallId] == 0) {
			that.callType = CT_VIDEO;
		}
		else {
			that.callType = CT_AUDIO;
		}

		Logcat("Do acceptCall ......");
		XMLHttp.queueReq("POST", that.url + "/anyapi/v1/talk_accept_call?DyncID=" + that.my_id + "&AnyrtcID=" + that.anyrtcId + "&CallId=" + strCallId, null, function (obj) {});
	
		return true;
	}

	/**
	 * 拒绝通话请求
	 * @strCallId
	 * 
	 * 当收到通话请求（通话请求或者通话邀）时，拒绝通话请求，建立通话连接
	**/
	RTMaxKit.prototype.rejectCall = function (strCallId) {
		var that = this;
		// 是否获得anyrtc分配的id
		if (IsNull(that.my_id)) {
			NotifyError(that, 'rejectCall', 'Please try it again after joinRTC success.');
			return false;
		}
		if (IsNull(strCallId)) {
			NotifyError(that, 'rejectCall', 'strCallId do not set to null.');
			return false;
		}
		
		Logcat("Do rejectCall ......");
		XMLHttp.queueReq("POST", that.url + "/anyapi/v1/talk_reject_call?DyncID=" + that.my_id + "&AnyrtcID=" + that.anyrtcId + "&CallId=" + strCallId, null, function (obj) {});
	
		return true;
	}

	/**
	 * 被叫方退出当前通话
	 * 
	 * 同意通话请求之后主动退出当前通话调用leaveCall，而非endCall（发起方调用）
	**/
	RTMaxKit.prototype.leaveCall = function () {
		var that = this;

		// 是否获得anyrtc分配的id
		if (IsNull(that.my_id)) {
			NotifyError(that, 'leaveCall', 'Please try it again after joinRTC success.');
			return false;
		}
		if (IsNull(that.callId)) {
			NotifyError(that, 'leaveCall', 'Not found call.');
			return false;
		}
		
		Logcat("Do leaveCall ......");
		XMLHttp.queueReq("POST", that.url + "/anyapi/v1/talk_leave_call?DyncID=" + that.my_id + "&AnyrtcID=" + that.anyrtcId + "&CallId=" + that.callId, null, function (obj) {});
		
		delete that.callTypeMap[that.callId];
		that.callType = CT_INIT;
		that.callId = "";
		//that.releaseStream();
		return true;
	}

	/**
	 * 发起视频监看（或者收到视频上报请求时查看视频）
	 * @param strUserId 被监看用户userId
	 * @param strUserData 自定义数据
	 * @return 返回值  0: 调用OK  -1:未登录    -5:本操作不支持自己对自己
	 * 
	 * 主动监看某个用户的视频；若收到用户“视频上报”时，同时调用该接口实现用户上报流程
 	*/
	RTMaxKit.prototype.monitorVideo = function (strPeerUserId, strUserData) {
		var that = this;

		// if (!OperationAvalible()) {
		// 	NotifyError(that, 'monitorVideo', 'Your operation is frequently, retry later : ).');
		// 	return false;
		// }

		// 是否获得anyrtc分配的id
		if (that.my_id === null || that.my_id === undefined || that.my_id === "") {
			NotifyError(that, 'monitorVideo', 'Please try it again after joinRTC success.');
			return false;
		}
		if (typeof strUserData !== "string") {
			NotifyError(that, 'monitorVideo', 'type of strUserData is not string.');
			return false;
		} else {
			if (strlen(strUserData) > 512) {
				NotifyError(that, 'monitorVideo', 'strUserData is out of length.');
				return false;
			}
		}

		Logcat("Do monitorVideo ......");
		XMLHttp.queueReq("POST", that.url + "/anyapi/v1/talk_v_monitor?DyncID=" + that.my_id + "&AnyrtcID=" + that.anyrtcId + "&PeerId=" + strPeerUserId, strUserData, function (obj) {});
		
		return true;
	}

	/**@deprecated
	 * 结束视频监看
	 *
	**/
	RTMaxKit.prototype.monitorVideoClose = function (strPeerUserId) {
		var that = this;
		// 是否获得anyrtc分配的id
		if (that.my_id === null || that.my_id === undefined || that.my_id === "") {
			NotifyError(that, 'monitorVideoClose', 'Please try it again after joinRTC success.');
			return false;
		}
		
		Logcat("Do monitorVideoClose ......");
		XMLHttp.queueReq("POST", that.url + "/anyapi/v1/talk_v_monitor_close?DyncID=" + that.my_id + "&AnyrtcID=" + that.anyrtcId + "&PeerId=" + strPeerUserId, null, function (obj) {});
		
		return true;
	}

	/**
	 * 结束视频监看
	 * @strPeerUserId
	 * 
	 * 取消对指定用户的视频监看
	**/
	RTMaxKit.prototype.closeVideoMonitor = function (strPeerUserId) {
		var that = this;
		// 是否获得anyrtc分配的id
		if (that.my_id === null || that.my_id === undefined || that.my_id === "") {
			NotifyError(that, 'monitorVideoClose', 'Please try it again after joinRTC success.');
			return false;
		}

		Logcat("Do monitorVideoClose ......");
		XMLHttp.queueReq("POST", that.url + "/anyapi/v1/talk_v_monitor_close?DyncID=" + that.my_id + "&AnyrtcID=" + that.anyrtcId + "&PeerId=" + strPeerUserId, null, function (obj) { });

		return true;
	}
	
	/**
	 * 设置远端用户是否可以接受自己的音视频
	 * @param strUserId 远端用户UserId
	 * @param bAudioEnabled true：音频可用，false：音频不可用
	 * @param bVideoEnabled true：视频可用，false：视频不可用
	 * 
	 * 设置指定用户是否看到自己的图像或听到自己的声音
	 */
	RTMaxKit.prototype.setRemoteCtrlAVStatus = function (strUserId, aEnable, vEnable) {
		var that = this;
		//检测用户昵称
		if (typeof strUserId !== "string") {
			NotifyError(that, 'sendUserMessage', 'type of strUserId is not string.');
			return false;
		} else {
			if (strlen(strUserId) > 256) {
				NotifyError(that, 'sendUserMessage', 'strUserId is out of length.');
				return false;
			}
		}

		var jsAvSetting = { "CMD": "AVSetting", "PeerUserId": strUserId, "AudioEnable": aEnable, "VideoEnable": vEnable };
		XMLHttp.queueReq("POST", that.url + "/anyapi/v1/talk_avsetting?DyncID=" + that.my_id + "&AnyrtcID=" + that.anyrtcId, JSON.stringify(jsAvSetting), function (obj) { });

		return true;
	}
		
	/**
	 * 发送对讲组消息
	 * @params strUserName           用户昵称
	 * @params strUserHeaderUrl      业务平台的用户头像       （Max 512字节）
	 * @params strContent            业务平台自定义消息内容   （Max 1024字节）
	 * 返回值 boolean
	 * 群组广播消息，组内人员将会收到```onRTCUserMessage```回调
	**/
	RTMaxKit.prototype.sendUserMessage = function (strUserName, strUserHeaderUrl, strContent) {
	 	var that = this;

		// 是否获得anyrtc分配的id
		if (that.my_id === null || that.my_id === undefined || that.my_id === "") {
			NotifyError(that, 'sendUserMessage', 'Please try it again after joinRTC success.');
			return false;
		}

		// userId为空不能发送消息
		if (that.userId === "") {
		 	NotifyError(that, 'sendUserMessage', 'userId is null or length is 0.');
		 	return false;
		}

		//检测用户昵称
		if (typeof strUserName !== "string") {
			NotifyError(that, 'sendUserMessage', 'type of strUserName is not string.');
			return false;
		} else {
			if (strlen(strUserName) > 256) {
				NotifyError(that, 'sendUserMessage', 'strUserName is out of length.');
				return false;
			}
	 	}

		//检测用户头像
		if (typeof strUserHeaderUrl !== "string") {
			NotifyError(that, 'sendUserMessage', 'type of strUserHeaderUrl is not string.');
			return false;
		} else {
			if (strlen(strUserHeaderUrl) > 512) {
				NotifyError(that, 'sendUserMessage', 'strUserHeaderUrl is out of length.');
				return false;
			}
	 	}

		//
		if (typeof strContent !== 'string') {
			NotifyError(that, 'sendUserMessage', 'type of strContent is not string.');
			return false;
		} else {
			if (strlen(strContent) > 1024) {
				NotifyError(that, 'sendUserMessage', 'strContent is out of length.');
				return false;
			}
	 	}

	 	var formData = {
	 		NickName: strUserName,
	 		Content: strContent
	 	};

	 	XMLHttp.queueReq("POST", that.url + "/anyapi/v1/talk_message?DyncID=" + that.my_id + "&AnyrtcID=" + that.anyrtcId + "&UserID=" + that.userId + "&Header=" + strUserHeaderUrl, JSON.stringify(formData), function (obj) {});
	
		return true;
	};

 	exports.RTMaxKit = RTMaxKit;
})(this);