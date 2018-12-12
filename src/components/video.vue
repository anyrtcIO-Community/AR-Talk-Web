<template>
  <div class="video">
    <div class="video-header">
      <span v-if="userId == ''">监看方</span>
      <span v-if="userId != ''">{{close == true ? '监看' : '上报'}} (ID : {{ userId }})</span>
      <span class="video-header_close" v-if="close" @click="closeMonitor">关闭</span>
    </div>
    <video :src="videoSrc" autoplay></video>
  </div>
</template>

<script>
export default {
  name: 'videoPlayer',

  data () {
    return {
      videoSrc: this.vSrc,
      userId: this.uId,
      pubId: this.pId,
      close: this.bClose
    }
  },

  props: {
    vSrc: String,
    uId: String,
    pId: String,
    bClose: {
      type: Boolean,
      default: true
    }
  },

  watch: {
    'vSrc' (src) {
      this.videoSrc = src;
    },
    'uId' (id) {
      this.userId = id;
    },
    'pId' (id) {
      this.pubId = id;
    },
    'bClose' (yes) {
      this.close = yes;
    }
  },

  methods: {
    closeMonitor () {
      this.$emit('closeVideo', this.userId, this.pubId);
    }
  }
}
</script>

<!-- Add "scoped" attribute to limit CSS to this component only -->
<style scoped>
  .video,
  .video-header {
    position: relative;
  }

  .video {
    width: 200px;
  }

  .video-header {
    padding: 0 10px;
    height: 40px;
    line-height: 40px;
    font-size: 12px;
    background-color: #fff;
  }

  .video-header:after {
    content: "";
    display: table;
    clear: both;
  }

  video {
    width: 100%;
    height: 112px;
    object-fit: contain;
    background-color: #000;
  }

  .video-header_close {
    float: right;
    cursor: pointer;
  }
</style>
