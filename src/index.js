const express = require("express");
const telegram = require("./telegram");
const axios = require("axios");
const app = express();
const fs  = require('fs');
const fsPromises = fs.promises;
const PORT = process.env.PORT || 3001;

/* var http = require('http');
var https = require('https');
var privateKey  = fs.readFileSync('key.pem');
var certificate = fs.readFileSync('cert.pem');

var credentials = {key: privateKey, cert: certificate};

  
var httpServer = http.createServer(app);
var httpsServer = https.createServer(credentials, app);

httpServer.listen(8080);
httpsServer.listen(3001); */
app.listen(PORT, () => console.log(`Server running on port ${PORT}`));
app.use(express.json());
let trackList = [];
let refreshIntervalId = -1;
let backendTimeInterval = "4h";

app.post("/setTelegram", (req, res) => {
    telegram.setTelegramConfig(req.body.telegramApi,req.body.chatId);
    backendTimeInterval = req.body.backendTimeInterval;
    res.send('telegram api set');
    console.log('telegram api set');
});
app.get("/sync", async (req, res) => {
    const data = await readTXT();
    trackList = JSON.parse(data.toString());
    //telegram.sendMsg('https://www.tradingview.com/chart/MATICUSDT/KtQCf9KJ-fkh/');
    res.send(trackList);
    console.log('sync done!')
});

function getBinanceData(symbol) {
  let url =
    "https://api.binance.com/api/v3/klines?symbol=" +
    symbol +
    "&interval=" +
    backendTimeInterval +
    "&limit=2";
  return axios 
    .get(url)
    .then((resBinance) => {
      const arr = [];
      for (let i = 0; i < resBinance.data.length; i++) {
        const a = {
          date: new Date(resBinance.data[i][0]),
          open: parseFloat(resBinance.data[i][1]),
          date2: resBinance.data[i][0],
          high: parseFloat(resBinance.data[i][2]),
          low: parseFloat(resBinance.data[i][3]), 
          close: parseFloat(resBinance.data[i][4]),
        };
        arr.push(a); 
      }
      return arr;
    })
} 

function searchRule(trackData,binanceData){
    if(trackData.operation === 'GREATER'){
        for (let i = 0; i < binanceData.length; i++) {
            const element = binanceData[i];
            if(element.high >= trackData.price) 
                return element; 
        }
    }else{
        for (let i = 0; i < binanceData.length; i++) { 
            const element = binanceData[i];
            if(element.low <= trackData.price)
                return element;
        }
    }
    return null;
}


app.get("/startBot", (req, res) => {
  telegram.sendMsg('Bot started!');
  botAlgo();
  res.send("bot started"); 
  refreshIntervalId = setInterval(() => {
    botAlgo();
  }, 1000*60*10);
});

app.get("/stop", (req, res) => {
  res.send("bot stopped");
  clearInterval(refreshIntervalId);
});

app.post("/add", async (req, res) => {
  const newEl = {
    key: Date.now(),
    ...req.body,
    conditionDone: false,
    candleCloseCondition: false,
    date: formatDate(new Date()),
  };
  trackList.push(newEl);
  await writeTXT(trackList);
  const data = await readTXT();
  trackList = JSON.parse(data.toString());
  res.send(trackList);
}); 
app.post("/remove", async (req, res) => {
  deleteTrackElement(req.body.key); 
  res.send(trackList);
});

function writeTXT (data) {
    return fsPromises.writeFile('trackList.txt', JSON.stringify(data));
}
function readTXT() {
    return fsPromises.readFile('trackList.txt');
}
function formatDate(currDate){
  return currDate.getFullYear() + "-" + (currDate.getMonth() + 1) + "-" + currDate.getDate() + " " + currDate.getHours() + ":" + currDate.getMinutes()
}
function deleteTrackElement(key){
    trackList = trackList.filter(el =>el.key !== key);
    writeTXT(trackList);
}

function botAlgo() {
    const promises = [];
    trackList.forEach(trackEl => {
        if(!trackEl.conditionDone || !trackEl.candleCloseCondition){
            promises.push(getBinanceData(trackEl.parity));
        }
    });
    Promise.all(promises).then(function (results) {
        results.forEach(function (response,index) { 
            checkPrevCandleClose(trackList[index],response);
            checkPrice(trackList[index],response);
        });
        writeTXT(trackList);
    }).catch(function(error) { 
      clearInterval(refreshIntervalId);
      telegram.sendMsg(error.message);
      });
}

function checkPrevCandleClose(trackEl,response) {
    const searched = searchPrevCandleRule(trackEl,response);
    if(searched !== null && !trackEl.candleCloseCondition){ 
        trackEl.candleCloseCondition = true;
      const msgText = `Parity: ${trackEl.parity} \nCandle closed ${trackEl.operation} than ${trackEl.price} \nTime: ${formatDate(new Date())} \nBUY/SELL SIGNAL!`
      telegram.sendMsg(msgText);
    }
}

function searchPrevCandleRule(trackData,binanceData){
    if(trackData.operation === 'GREATER'){
        if(binanceData[binanceData.length-2].close  > trackData.price)
            return 1;
    }else {
        if(binanceData[binanceData.length-2].close  < trackData.price)
            return 2;
    }
    return null;
}

function checkPrice(trackEl,response){
    const searched = searchRule(trackEl,response);
    if(searched !== null && !trackEl.conditionDone){ 
        trackEl.conditionDone = true;
      const msgText = `Parity: ${trackEl.parity} \nPrice ${trackEl.operation} than ${trackEl.price} \nTime: ${formatDate(new Date())} \n`
      telegram.sendMsg(msgText);
    }
}