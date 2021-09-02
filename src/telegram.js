const TelegramBot = require("node-telegram-bot-api");

let bot;
let chatId;

module.exports = {
  sendMsg: (msg) => {
    if(bot){
      bot.sendMessage(chatId, msg);
    }
  },
  setTelegramConfig: (telegramApi,chatIdParam)=>{
    bot = new TelegramBot(telegramApi, {
      polling: true,
    });
    chatId = chatIdParam;
  }
};
