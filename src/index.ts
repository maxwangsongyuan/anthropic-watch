export default {
  async fetch(): Promise<Response> {
    return new Response("anthropic-watch is running");
  },
  async scheduled(): Promise<void> {
    console.log("cron triggered");
  },
};
