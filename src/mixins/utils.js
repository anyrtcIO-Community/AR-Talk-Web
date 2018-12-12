export default {
  methods: {
    randomUserId(len) {
      return parseInt(Math.random() * Math.pow(10, len));
    },
    
  }
}