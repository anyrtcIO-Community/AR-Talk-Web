/*! anyrtc.js build:0.0.3, development. Copyright(c) 2017 BoYuan@SH */
(function (exports) {
	var gAnyrtc = null;
    //var PeerConnection = (window.PeerConnection || window.webkitPeerConnection00 || window.webkitRTCPeerConnection || window.mozRTCPeerConnection);
	var URL = (window.URL || window.webkitURL || window.msURL || window.oURL);
	var getUserMedia = (navigator.getUserMedia || navigator.webkitGetUserMedia || navigator.mozGetUserMedia || navigator.msGetUserMedia);
	var nativeRTCIceCandidate = (window.mozRTCIceCandidate || window.RTCIceCandidate);
	var nativeRTCSessionDescription = (window.mozRTCSessionDescription || window.RTCSessionDescription); // order is very important: "RTCSessionDescription" defined in Nighly but useless
	var moz = !!navigator.mozGetUserMedia;
	var iceServer = {'iceServers': []};

	var AUDIO_MAT_BITRATE = 20;
	var VIDEO_MAT_BITRATE = 512;
	var VIDEO_CODEC_PARAM_MAX_BITRATE = "x-google-max-bitrate";
	var VIDEO_CODEC_PARAM_MIN_BITRATE = "x-google-min-bitrate";
	var VIDEO_CODEC_PARAM_START_BITRATE = "x-google-start-bitrate";
	var AUDIO_CODEC_PARAM_BITRATE = "maxaveragebitrate";

	/**********************************************************/
	/*                                                        */
	/*                       事件处理器                       */
	/*                                                        */

	/**********************************************************/
	function EventEmitter () {
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


	/**********************************************************/
	/*                                                        */
	/*                   流及信道建立部分                     */
	/*                                                        */

	/**********************************************************/


	/*******************基础部分*********************/
	function AnyRTC () {
		gAnyrtc = this;
		if (!(this instanceof AnyRTC)) return new AnyRTC();

		this.pcPuber = null;
		this.pcPuberChanId = "";//当前pc对应的chanId
		this.pcPuberPubId = "";//当前pc对应的pubId
		//本地media stream
		this.localMediaStream = null;
    
		//屏幕共享
		this.scrnPuber = null;
		this.scrnMediaStream = null;
    
		this.audioDetect = true;
		//
		this.filterExcept = false;
		this.strSubFilterPeerid = "";
		//
		this.subscribers = {};	// 记录pubId对应的chanId
		//保存所有与本地相连的peer connection， 键为peer_id，值为PeerConnection类型
		this.peerConnections = {};

		//保存用户的相关信息：pubId为主键、网络状态、视频码率、音频大小
		this.peerStates = {};
		//保存所有chanId对应的250毫秒的Interval的次数，（4n+1）就是间隔一秒
		this.peerVideoLastIndex = {};
		//初始时需要构建链接的数目
		this.numStreams = 0;
		//初始时已经连接的数目
		this.initializedStreams = 0;
		// RTC内核版本
		// this.version = "V2017.09.19.001";
		this.version = "V2018.07.05.001";
	}

	//继承自事件处理器，提供绑定事件和触发事件的功能
	AnyRTC.prototype = new EventEmitter();

	/*************************服务器连接部分***************************/

	//订阅过滤
	AnyRTC.prototype.setSubscribeFileter = function(strRtcPeerId, bExcept) {
		var that = this;
		that.filterExcept = bExcept;
		that.strSubFilterPeerid = strRtcPeerId;
	}

	/***********************信令交换部分*******************************/
	//向所有PeerConnection发送Offer类型信令
	AnyRTC.prototype.sendOffer = function (chanId, pc) {
		var that = this;
		var pcCreateOfferCbGen = function (pc, peerId) {
				return function (offer) {
					pc.setLocalDescription(offer);
					var jsJsep = {
						"sdp": offer.sdp,
						"type": offer.type
					};
					var jstr = JSON.stringify({
						"anyrtc": "message",
						"body": {"request": "configure", "audio": true, "video": true},
						"transaction": "x8981",
						"jsep": jsJsep
					});
					//console.log("Offer: " + jstr);
					that.emit('onSendToPeer', peerId, jstr);
				};
			},
			pcCreateOfferErrorCb = function (error) {
				console.log(error);
			};
		pc.createOffer(pcCreateOfferCbGen(pc, chanId), pcCreateOfferErrorCb);
	};

	/***********************发布/订阅流部分*****************************/
	AnyRTC.prototype.createPublisher = function (chanId, pubId) {
		var that = this;
		var publisher = that.peerConnections[chanId];
		if (publisher == null) {
			var pc = that.createPeerConnection(chanId);
			pc.rtcType = "PubVid";
			that.pcPuber = pc;
			that.pcPuberChanId = chanId;
			that.pcPuberPubId = pubId;

			that.localMediaStream && that.localMediaStream.getTracks().forEach(function (track) {
				var sender = that.pcPuber.addTrack(track, that.localMediaStream);
				// that.sender.push(sender);
			});

			//将本地流添加到PeerConnection实例中
			// pc.addStream(that.localMediaStream);
			that.sendOffer(chanId, pc);
			// that.sendOffer(chanId, that.pcPuber);
		}
	};


	AnyRTC.prototype.reStartPublisher = function (chanId, pubId) {
		var that = this;
		var publisher = that.peerConnections[chanId];
		if (publisher != null) {
			var pcCreateOfferCbGen = function (pc, peerId) {
				return function (offer) {
					pc.setLocalDescription(offer);
					var jsJsep = {
						"sdp": offer.sdp,
						"type": offer.type
					};
					var jstr = JSON.stringify({
						"anyrtc": "message",
						"body": { "request": "configure", "audio": true, "video": true, "switchav": true },
						"transaction": "x8981",
						"jsep": jsJsep
					});
					// console.log("Offer: " + jstr);
					that.emit('onSendToPeer', peerId, jstr);
				};
			},
				pcCreateOfferErrorCb = function (error) {
					console.log(error);
				};
			var offerOptions = {};
			offerOptions.iceRestart = true;
			publisher.createOffer(offerOptions).then(pcCreateOfferCbGen(publisher, chanId), pcCreateOfferErrorCb);
		}
	};

	AnyRTC.prototype.destroyPublisher = function (chanId) {
		var that = this;
		var publisher = that.peerConnections[chanId];
		if (publisher != null) {
			that.closePeerConnection(publisher);
			delete that.peerConnections[chanId];	// 删除对象中这个元素
		}
	};
  
	AnyRTC.prototype.createPublisherEx = function(chanId)
	{
		var that = this;
		var publisher = that.peerConnections[chanId];
		if(publisher == null)
		{
			var pc = that.createPeerConnection(chanId);
			pc.rtcType = "PubScrn";
			that.scrnPuber = pc;
			//将本地流添加到PeerConnection实例中
			pc.addStream(that.scrnMediaStream);
			that.sendOffer(chanId, pc);
		}
	}
	
	AnyRTC.prototype.destroyPublisherEx = function(chanId)
	{
		var that = this;
		var publisher = that.peerConnections[chanId];
		if(publisher != null)
		{
			if(that.scrnMediaStream != null)
			{
				that.scrnMediaStream.getTracks().forEach(function (track) {
					track.stop();
				});
				// publisher.removeStream(that.scrnMediaStream);
				that.scrnMediaStream = null;
			}
			that.closePeerConnection(publisher);
			delete that.peerConnections[chanId];	// 删除对象中这个元素
		}
		that.scrnPuber = null;
	}
	AnyRTC.prototype.createSubscriber = function (chanId, pubId, offer) {
		var that = this;
		var subscriber = that.peerConnections[chanId];
		if (subscriber == null) {
			that.subscribers[pubId] = chanId;
			var pc = that.createPeerConnection(chanId);
			pc.rtcType = "Suber";
			pc.setRemoteDescription(new nativeRTCSessionDescription(offer), function () {
			}, function (error) {
				console.log(error);
			});
			that.emit('onMemberJoin', pubId);
			pc.createAnswer(function (answer) {
				pc.setLocalDescription(answer);
				/*console.log("Answer: " + JSON.stringify({
					"sdp": answer.sdp,
					"type": answer.type
				}));*/
				var jsJsep = {
					"sdp": answer.sdp,
					"type": answer.type
				};
				var jstr = JSON.stringify({
					"anyrtc": "message",
					"body": {"request": "start", "room": "12345"},
					"transaction": "x8981",
					"jsep": jsJsep
				});
				that.emit('onSendToPeer', chanId, jstr);
			}, function (error) {
				console.log(error);
			});
		}
	};

	AnyRTC.prototype.destroySubscriber = function (pubId) {
		var that = this;
		var chanId = that.subscribers[pubId];
		if (chanId != null) {
			var subscriber = that.peerConnections[chanId];
			if (subscriber != null) {
				that.closePeerConnection(subscriber);
				delete that.peerConnections[chanId];
				that.emit('onMemberLeave', pubId);
			}

			//chanId对应lastBytes（pc.getStats()中的 ‘report.type='inbound-rtp' report.mediaType='video'’ lastBytes 最后收到的码率）
			var Index = that.peerVideoLastIndex[chanId];
			if (Index != null) {
				delete that.peerVideoLastIndex[chanId];
			}
			//chanId对应的用户的一些状态，包括（网络状况、音频大小）
			var States = that.peerStates[chanId];
			if (States != null) {
				delete that.peerStates[chanId];
			}

			delete that.subscribers[pubId];
		}

		return chanId;
	};

	AnyRTC.prototype.destroyAll = function () {
		var that = this;
		AnyRTC.prototype.events = {};
		for (connection in that.peerConnections) {
			var peerConn = that.peerConnections[connection];
			that.closePeerConnection(peerConn);
			delete that.peerConnections[connection];
		}
	};

	AnyRTC.prototype.getSdpInfo = function (chanId, jstr) {
		var that = this;
		var peerConn = that.peerConnections[chanId];
		if (peerConn != null) {
			var jsBody = JSON.parse(jstr);
			if (jsBody.type != undefined) {
				if(peerConn.rtcType != undefined && peerConn.rtcType == "PubScrn") {
					jsBody.sdp = setBitrate("VP9", true, jsBody.sdp, 128);
					jsBody.sdp = setBitrate("VP8", true, jsBody.sdp, 128);
					jsBody.sdp = setBitrate("H264", true, jsBody.sdp, 128);
				} 
				else 
				{
					jsBody.sdp = setBitrate("VP9", true, jsBody.sdp, VIDEO_MAT_BITRATE);
					jsBody.sdp = setBitrate("VP8", true, jsBody.sdp, VIDEO_MAT_BITRATE);
					jsBody.sdp = setBitrate("H264", true, jsBody.sdp, VIDEO_MAT_BITRATE);
				}
				jsBody.sdp = setBitrate("opus", false, jsBody.sdp, AUDIO_MAT_BITRATE);
				peerConn.setRemoteDescription(new nativeRTCSessionDescription(jsBody), function () {
				}, function (error) {
					console.log(error);
				});
			}
			else {
				var candidate = new nativeRTCIceCandidate({
					sdpMLineIndex: jsBody.sdpMLineIndex,
					candidate: jsBody.candidate
				});
				if (navigator.userAgent.indexOf('Firefox') > -1) {//firfox 判断(talk 监看不出像)
					peerConn.addIceCandidate(candidate);
				}
				peerConn.addIceCandidate(candidate, function () {
					console.log("peerConn.addIceCandidate  OK");
				}, function (error) {
					console.log("peerConn.addIceCandidate err: " + error);
				});
			}
		}
	};

	/*************************流媒体处理部分***************************/
	//创建本地流
	AnyRTC.prototype.createStream = function () {
		var that = this;

		var DeviceOptions = null;
		var liveModel = null;
		var DRender = null;
		var cameraId = null;
		var micphoneId = null;
		var switchStream = false;

		if (typeof arguments[0] !== "object") {
			
		} else {
			DeviceOptions = arguments[0];

			if (DeviceOptions.cameraDeviceId !== "" && DeviceOptions.cameraDeviceId !== undefined && DeviceOptions.cameraDeviceId !== null) {
				cameraId = DeviceOptions.cameraDeviceId
			}
			if (DeviceOptions.microphoneDeviceId !== "" && DeviceOptions.microphoneDeviceId !== undefined && DeviceOptions.microphoneDeviceId !== null) {
				micphoneId = DeviceOptions.microphoneDeviceId
			}
		}

		if (typeof arguments[1] !== "string") {

		} else {
			liveModel = arguments[1];
		}

		if (typeof arguments[2] !== "object" && Object.prototype.toString.call(DRender).indexOf("[object HTML") === -1) {

		} else {
			DRender = arguments[2];
		}

		if (typeof arguments[3] !== "boolean") {
			
		} else {
			switchStream = arguments[3];
		}
		
		// 设置码率
		var constraints;

		switch (liveModel) {
			case 'RTCMeet_Videos_Flow':
			case 'AnyRTCVideoQuality_Low1':
				VIDEO_MAT_BITRATE = 128;

				constraints = {
					"video": DeviceOptions.needCamera ? computedConstraints({ width: 320, height: 240 }, cameraId) : false,
					"audio": DeviceOptions.needMicrophone ? computedConstraints({}, micphoneId) : false 
				};
			break;

			case 'RTCP_Videos_Low':
			case 'RTCMeet_Videos_Low':
			case 'AnyRTCVideoQuality_Low2':
				VIDEO_MAT_BITRATE = 256;

				constraints = {
					"video": DeviceOptions.needCamera ? computedConstraints({ width: { 'max': 352, 'ideal': 352, 'min': 320 }, height: { 'max': 288, 'ideal': 288,'min': 240 } }, cameraId) : false,
					"audio": DeviceOptions.needMicrophone ? computedConstraints({}, micphoneId) : false 
				};
			break;

			case 'AnyRTCVideoQuality_Low3':
				VIDEO_MAT_BITRATE = 384;

				constraints = {
					"video": DeviceOptions.needCamera ? computedConstraints({ width: { 'max': 352, 'ideal': 352, 'min': 320 }, height: { 'max': 288, 'ideal': 288, 'min': 240 } }, cameraId) : false,
					"audio": DeviceOptions.needMicrophone ? computedConstraints({}, micphoneId) : false
				};
			break;

			case 'RTMPC_Video_Low':
			case 'AnyRTCVideoQuality_Medium1':
				VIDEO_MAT_BITRATE = 384;

				constraints = {
					"video": DeviceOptions.needCamera ? computedConstraints({ width: { 'max': 640, 'ideal': 640, 'min': 352 }, height: { 'max': 480, 'ideal': 480, 'min': 288 } }, cameraId) : false,
					"audio": DeviceOptions.needMicrophone ? computedConstraints({}, micphoneId) : false
				};
			break;

			case 'RTCMeet_Videos_SD':
			case 'RTMPC_Video_SD':
			case 'RTCP_Videos_SD':
			case 'AnyRTCVideoQuality_Medium2':
				VIDEO_MAT_BITRATE = 512;

				constraints = {
					"video": DeviceOptions.needCamera ? computedConstraints({ width: { 'max': 640, 'ideal': 640, 'min': 352 }, height: { 'max': 480, 'ideal': 480,'min': 288 } }, cameraId) : false,
					"audio": DeviceOptions.needMicrophone ? computedConstraints({}, micphoneId) : false 
				};
			break;

			case 'RTMPC_Video_QHD':
			case 'AnyRTCVideoQuality_Medium3':
				VIDEO_MAT_BITRATE = 768;

				constraints = {
					"video": DeviceOptions.needCamera ? computedConstraints({ width: { 'max': 640, 'ideal': 640, 'min': 352, }, height: { 'max': 480, 'ideal': 480, 'min': 288 } }, cameraId) : false,
					"audio": DeviceOptions.needMicrophone ? computedConstraints({}, micphoneId) : false
				};
			break;

			case 'RTCP_Videos_QHD':
			case 'AnyRTCVideoQuality_Height1':
				VIDEO_MAT_BITRATE = 1024;

				constraints = {
					"video": DeviceOptions.needCamera ? computedConstraints({ width: { 'max': 640, 'ideal': 640, 'min': 352 }, height: { 'max': 480, 'ideal': 480, 'min': 288 } }, cameraId) : false,
					"audio": DeviceOptions.needMicrophone ? computedConstraints({}, micphoneId) : false
				};
			break;

			case 'RTCMeet_Videos_HD':
			case 'RTMPC_Video_HD':
			case 'RTCP_Videos_HD':
			case 'AnyRTCVideoQuality_Height2':
				VIDEO_MAT_BITRATE = 1280;

				constraints = {
					"video": DeviceOptions.needCamera ? computedConstraints({ width: { 'max': 1280, 'ideal': 1280, 'min': 640 }, height: { 'max': 720, 'ideal': 720,'min': 480 } }, cameraId) : false,
					"audio": DeviceOptions.needMicrophone ? computedConstraints({}, micphoneId) : false 
				};
			break;

			case 'RTCMeet_Videos_HHD':
			case 'RTMPC_Video_1080P':
			case 'AnyRTCVideoQuality_Height3':
				VIDEO_MAT_BITRATE = 2048;

				constraints = {
					"video": DeviceOptions.needCamera ? computedConstraints({ width: { 'max': 1920, 'ideal': 1920, 'min': 1280 }, height: { 'max': 1080, 'ideal': 1080,'min': 720 } }, cameraId) : false,
					"audio": DeviceOptions.needMicrophone ? computedConstraints({}, micphoneId) : false 
				};
			break;
			
			default:
				VIDEO_MAT_BITRATE = 256;

				constraints = {
					"video": DeviceOptions.needCamera ? computedConstraints({ width: { 'max': 352, 'ideal': 352, 'min': 320 }, height: { 'max': 288, 'ideal': 288, 'min': 240 } }, cameraId) : false,
					"audio": DeviceOptions.needMicrophone ? computedConstraints({}, micphoneId) : false
				};
			break;
		}

		if (!navigator.mediaDevices) {
			that.emit("stream_create_error", 9, "NotSupportWebRTC");
		} else {
			this.numStreams++;

			navigator.mediaDevices.getUserMedia(constraints).then(function (stream) {

				if (switchStream) {
					that.replaceLocalStream(stream);
					return
				}

				that.localMediaStream = stream;

				// that.initializedStreams++;

				// DOM 设置RTC流
				that.emit("stream_created", stream, that.attachStream(stream, DRender));
			}).catch(function (err) {
				console.error("[anyRTC] getUserMedia error", err);
				
				that.emit("stream_create_error", 7, err.name);
				if (err.name === "DevicesNotFoundError" || err.name === "NotFoundError") {// 请检查你的摄像头和音频
				} else if (err.name === "NotReadableError" || err.name === "TrackStartError") {// 本地摄像头被占用
				} else if (err.name === "OverconstrainedError" || err.name === "ConstraintNotSatisfiedErrror") {// 硬件不满足当前系统设置的分辨率
				} else if (err.name === "NotAllowedError" || err.name === "PermissionDeniedError") {// 用户没有允许访问摄像头权限
				}
			})
		}
	};

	//更换本地视频流
	AnyRTC.prototype.replaceLocalStream = function (stream) {
		var that = this;

		/* that.sender.forEach(function (sender, index) {
			that.pcPuber.removeTrack(sender);
			that.sender.splice(index, 1);
			console.log("that.sender", that.sender);
		});
		
		stream.getTracks().forEach(function (track) {
			// that.pcPuber.addTrack(track, that.localMediaStream);
			var sender = that.pcPuber.addTrack(track, that.localMediaStream);
			that.sender.push(sender);
		}); */

		let vTrack = stream.getVideoTracks()[0];
		var sender = that.pcPuber.getSenders().find(function (s) {
			return s.track.kind == vTrack.kind;
		});
		console.log('found sender:', sender);
		sender.replaceTrack(vTrack);

		return
		if (that.pcPuber !== null) {
			var videoTrack = that.localMediaStream.getVideoTracks()[0];
			videoTrack.stop();
			that.localMediaStream.removeTrack(videoTrack);
			that.localMediaStream.addTrack(stream.getVideoTracks()[0]);

			that.pcPuber.addTrack(stream.getVideoTracks()[0], that.localMediaStream);
			// that.pcPuber.removeStream(that.localMediaStream);
			// that.pcPuber.addStream(stream);
		}
		// that.localMediaStream = stream;

		that.reStartPublisher(that.pcPuberChanId, that.pcPuberPubId);

		// that.emit('onLocalStreamUpdated', that.pcPuberPubId, stream);
	};

	//将本地流添加到所有的PeerConnection实例中
	AnyRTC.prototype.addStreams = function () {
		var that = this;
		var i, m,
			stream,
			connection;
		for (connection in this.peerConnections) {
			that.peerConnections[connection].addStream(that.localMediaStream);
		}
	};

	//将流绑定到video标签上用于输出
	AnyRTC.prototype.attachStream = function (stream, DRender) {
		var element = DRender;
		element.muted = true;
		element.autoplay = "autoplay";
		element.srcObject = stream;

		return element;
	};

	/***********************点对点连接部分*****************************/

	//创建单个PeerConnection
	AnyRTC.prototype.createPeerConnection = function (chanId) {
		var that = this;
		var pc = new RTCPeerConnection(iceServer);
		this.peerConnections[chanId] = pc;

		var pcVideoTrack = null;//beta
		var pcAudioTrack = null;//beta

		pc.onicecandidate = function (evt) {
			if (evt.candidate) {
				var jsCan = {
					"candidate": evt.candidate.candidate,
					"sdpMLineIndex": evt.candidate.sdpMLineIndex,
					"sdpMid": evt.candidate.sdpMid
				};
				var jstr = JSON.stringify({
					"anyrtc": "trickle",
					"body": {"request": "configure", "audio": true, "video": true},
					"candidate": jsCan
				});
				that.emit('onSendToPeer', chanId, jstr);
			}
		};
		
		pc.oniceconnectionstatechange = function(event) {
			switch(pc.iceConnectionState) {
				case "connected":
				  // The connection has become fully connected
				  break;
				case "disconnected":
				case "failed":
				  // One or more transports has terminated unexpectedly or in an error
				  if(pc.rtcType == "Suber")
					{
						for(var pid in that.subscribers) {
							if(that.subscribers[pid] == chanId) {
								that.emit('onIceDisconnected', false, pid, chanId);
								break;
							}
						}
						
					} 
					else if (pc.rtcType == "PubVid") {
						that.emit('onIceDisconnected', true, "Puber", chanId);
					}
							
				  break;
				case "closed":
				  // The connection has been closed
				  break;
			}
			
			console.log('oniceconnectionstatechange: ' + pc.iceConnectionState);
		};

		pc.onopen = function () {
			//* that.emit("pc_opened", chanId, pc);
		};

		// pc.onaddstream = function (evt) {
		// 	var pubId = "";
		// 	for(var pid in that.subscribers) {
		// 		if(that.subscribers[pid] == chanId) {
		// 			pubId = pid;
		// 			break;
		// 		}
		// 	}

		// 	that.emit('onRemoteStream', evt.stream, pubId);
		// };

		pc.ontrack = function (evt) {//beta
			var pubId = "";
			for (var pid in that.subscribers) {
				if (that.subscribers[pid] == chanId) {
					pubId = pid;
					break;
				}
			}
      that.emit('onRemoteStream', evt.streams[0], pubId);

			if (evt.track.kind === "video") {
				// pcVideoTrack = evt.track;
				that.emit('onRemoteVideoStream', evt.streams && evt.streams[0], pubId);
			} else if (evt.track.kind === "audio") {
				// pcAudioTrack = evt.track;
				that.emit('onRemoteAudioStream', evt.streams && evt.streams[0], pubId);
			}
		};

		pc.ondatachannel = function (evt) {
			//* that.emit('pc_add_data_channel', evt.channel, chanId, pc);
		};
		return pc;
	};

	//关闭PeerConnection连接
	AnyRTC.prototype.closePeerConnection = function (pc) {
		if (!pc) return;
		pc.close();
	};

	function getRtcStats (chanId, pc) {
		var that = gAnyrtc;
		pc.getStats(null)
		.then(function (results) {
			//* Refer from: https://webrtc.github.io/samples/src/content/peerconnection/constraints/
			results.forEach(function(report) {
				var now = report.timestamp;

				!that.peerStates[chanId] && (that.peerStates[chanId] = {});

				if (report.type === 'track') {
					if (report.kind === 'audio') {//音频音量
						var audioLevel = report.audioLevel;//音量大小
						audioLevel = parseInt(audioLevel*100);
						// if(audioLevel) {
							//更新用户状态--音频大小
							that.peerStates[chanId].audioLevel = audioLevel;

							var pubId = null;
							for(var pid in that.subscribers) {
								if(that.subscribers[pid] == chanId) {
									pubId = pid;
									if(pubId != null) {
										// if (audioLevel >= 4) {
											that.emit('onPeerAudioDetect', pubId, audioLevel);
											// console.log("AudioLevel: " + audioLevel);
										// }
									}
									break;
								}
							}
						// }
					} else if (report.kind === 'video') {//视频分辨率
						// frameHeight frameWidth framesSent
					}
				}

				//网络状态
				if (report.type === 'transport') {
					var lastNetBytes = that.peerStates[chanId]['lastNetBytes'] ? that.peerStates[chanId]['lastNetBytes'] : '';//上一次收到的总字节
					var currentNetBytes = report.bytesReceived;//当前收到的总字节
					
					//更新用户状态--覆盖上一次收到的网络字节大小
					that.peerStates[chanId]['lastNetBytes'] = currentNetBytes;
					//每秒的收到的字节大小
					var netBytes = parseInt((currentNetBytes - lastNetBytes)/1024*8);
					//更新用户状态--当前接受的网络字节大小
					that.peerStates[chanId]['netBytes'] = netBytes;
				}

				if (report.type === 'inbound-rtp' && report.mediaType === 'video') {//视频码率 && 丢包率
					//以下是需要1秒钟发一次的回调
					that.peerVideoLastIndex[chanId] = isNaN(that.peerVideoLastIndex[chanId]) ? 1 : that.peerVideoLastIndex[chanId];
					var lastIndex = that.peerVideoLastIndex[chanId];

					//当前的次数是4n+1才执行
					if ((lastIndex - 1)%4 === 0) {
						//视频码率
						var lastBytes = that.peerStates[chanId]['lastBytes'] ? that.peerStates[chanId]['lastBytes'] : '';//上一次视频收到的总字节
						var currentBytes = report.bytesReceived;//当前视频收到的总字节
						//更新用户状态--覆盖上一次视频码率
						that.peerStates[chanId]['lastBytes'] = currentBytes;
						//每秒的收到的字节大小
						var videoBytes = parseInt((currentBytes - lastBytes)/1024*8);
						//更新用户状态--当前视频码率
						that.peerStates[chanId]['videoBytes'] = videoBytes;
						//视频码率回调
						if(videoBytes !== null && videoBytes !== undefined) {
							var pubId = null;
							for(var pid in that.subscribers) {
								if(that.subscribers[pid] == chanId) {
									pubId = pid;
									if(pubId != null) {
										that.emit('onPeerVideoBytes', pubId, videoBytes);
									}
									break;
								}
							}
						}
						
						//丢包率
						var lastPacketsLost = that.peerStates[chanId]['lastPacketsLost'] ? that.peerStates[chanId]['lastPacketsLost'] : '';
						var currentPacketsLost = report.packetsLost;//当前收到的总字节
						//更新用户状态--覆盖上一次丢包率
						that.peerStates[chanId]['lastPacketsLost'] = currentPacketsLost;
						//每秒的收到的字节大小
						var pkgLost = parseInt(currentPacketsLost - lastPacketsLost);
						//更新用户状态--当前丢包率
						that.peerStates[chanId]['pkgLost'] = pkgLost;

						//网络状态回调
						if (that.peerStates[chanId]['netBytes'] !== null && that.peerStates[chanId]['netBytes'] !== undefined && pkgLost !== null && pkgLost !== undefined) {
							var pubId = null;
							for(var pid in that.subscribers) {
								if(that.subscribers[pid] == chanId) {
									pubId = pid;
									if(pubId != null) {
										that.emit('onRTCNetworkStatus', pubId, that.peerStates[chanId]['netBytes'], pkgLost);
										// console.log("netBytes: " + that.peerStates[chanId]['netBytes']);
										// console.log("pkgLost: " + pkgLost);
									}
									break;
								}
							}
						}
					}

					that.peerVideoLastIndex[chanId] ++;
				}
			});
		}, function(err) {
		  console.log(err);
		});
	}

  var INTERVAL_TIME = 250;//定时器的轮询时间毫秒
	// Display statistics
	setInterval(function() {
		if(gAnyrtc == null)
			return;
		var that = gAnyrtc;
		if(that.audioDetect)
		{
			for (chanId in that.peerConnections) {
				var peerConn = that.peerConnections[chanId];
				if(peerConn.rtcType == "Suber")
				{
					getRtcStats(chanId, peerConn);
				}
				//  else if (peerConn.rtcType == "PubVid") {
				// 	getRtcStats(true, chanId, peerConn);
				// }
			}
		}
	}, INTERVAL_TIME);

	/**********************************************************/
	/*                                                        */
	/*                       公用函数体                       */
	/*                                                        */

	/**********************************************************/
	function setBitrate (codec, isVideoCodec, sdpDescription, bitrateKbps) {
		var lines = sdpDescription.split("\r\n");
		var rtpmapLineIndex = -1;
		var sdpFormatUpdated = false;
		var codecRtpMap = null;
		// Search for codec rtpmap in format
		// a=rtpmap:<payload type> <encoding name>/<clock rate> [/<encoding parameters>]
		var regex = "^a=rtpmap:(\\d+) " + codec + "(/\\d+)+[\r]?$";
		var codecPattern = new RegExp(regex);
		for (i = 0; i < lines.length - 1; i++) {
			var codecMatcher = lines[i].match(codecPattern);
			if (codecMatcher != null) {
				codecRtpMap = codecMatcher[1];
				rtpmapLineIndex = i;
				break;
			}
		}
		if (codecRtpMap == null) {
			//console.log("No rtpmap for " + codec + " codec");
			return sdpDescription;
		}
		/*console.log("Found " + codec + " rtpmap " + codecRtpMap
			+ " at " + lines[rtpmapLineIndex]);*/
		// Check if a=fmtp string already exist in remote SDP for this codec and
		// update it with new bitrate parameter.
		regex = "^a=fmtp:" + codecRtpMap + " \\w+=\\d+.*[\r]?$";
		codecPattern.compile(regex);
		for (i = 0; i < lines.length - 1; i++) {
			var codecMatcher = lines[i].match(codecPattern);
			if (codecMatcher != null) {
				//console.log("Found " + codec + " " + lines[i]);
				if (isVideoCodec) {
					lines[i] += "; " + VIDEO_CODEC_PARAM_MAX_BITRATE
						+ "=" + bitrateKbps;
				} else {
					lines[i] += "; " + AUDIO_CODEC_PARAM_BITRATE
						+ "=" + (bitrateKbps * 1000);
				}
				//console.log("Update remote SDP line: " + lines[i]);
				sdpFormatUpdated = true;
				break;
			}
		}

		var newSdpDescription = "";
		for (i = 0; i < lines.length - 1; i++) {
			newSdpDescription += lines[i] + "\r\n";
			// Append new a=fmtp line if no such line exist for a codec.
			if (!sdpFormatUpdated && i == rtpmapLineIndex) {
				var bitrateSet;
				if (isVideoCodec) {
					bitrateSet = "a=fmtp:" + codecRtpMap + " "
						+ VIDEO_CODEC_PARAM_MAX_BITRATE + "=" + bitrateKbps;
				} else {
					bitrateSet = "a=fmtp:" + codecRtpMap + " "
						+ AUDIO_CODEC_PARAM_BITRATE + "=" + (bitrateKbps * 1000);
				}
				//console.log("Add remote SDP line: " + bitrateSet);
				newSdpDescription += bitrateSet + "\r\n";
			}
		}

		return newSdpDescription;
	}

	//合并constraints
	function computedConstraints(basicOpt, deviceId) {
		var that = this;

		if (deviceId === null || deviceId === "") {
			if (Object.keys(basicOpt).length === 0) {
				return true;
			}
			return basicOpt;
		} else {
			return Object.assign(basicOpt, { 'deviceId': deviceId });
		}
	}

	exports.AnyRTC = AnyRTC;
})(this);
