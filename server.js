require("dotenv").config();
const express = require("express");
const cors = require("cors");
const axios = require("axios");

const app = express();
const PORT = process.env.PORT || 3000;

// CWA API 設定
const CWA_API_BASE_URL = "https://opendata.cwa.gov.tw/api";
const CWA_API_KEY = process.env.CWA_API_KEY;

// Middleware
app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// === 新增：城市代碼對照表 ===
// 這樣前端傳送英文代碼進來，我們就知道要去 CWA 查哪個中文城市
const CITY_MAP = {
  taipei: "臺北市",
  new_taipei: "新北市",
  taoyuan: "桃園市",
  taichung: "臺中市",
  tainan: "臺南市",
  kaohsiung: "高雄市"
};

/**
 * 取得指定城市天氣預報 (通用版)
 */
const getCityWeather = async (req, res) => {
  try {
    // 1. 從網址取得城市代碼 (例如: tainan)
    const cityCode = req.params.city;
    
    // 2. 轉換成中文城市名稱 (例如: 臺南市)
    const targetLocation = CITY_MAP[cityCode];

    // 如果找不到對應的城市代碼，回傳錯誤
    if (!targetLocation) {
      return res.status(400).json({
        success: false,
        error: "參數錯誤",
        message: "不支援此城市代碼，請使用: taipei, new_taipei, taoyuan, taichung, tainan, kaohsiung",
      });
    }

    // 檢查是否有設定 API Key
    if (!CWA_API_KEY) {
      return res.status(500).json({
        error: "伺服器設定錯誤",
        message: "請在 .env 檔案中設定 CWA_API_KEY",
      });
    }

    // 呼叫 CWA API
    const response = await axios.get(
      `${CWA_API_BASE_URL}/v1/rest/datastore/F-C0032-001`,
      {
        params: {
          Authorization: CWA_API_KEY,
          locationName: targetLocation, // <--- 這裡改成變數了！
        },
      }
    );

    // 取得該城市的天氣資料
    const locationData = response.data.records.location[0];

    if (!locationData) {
      return res.status(404).json({
        error: "查無資料",
        message: `無法取得 ${targetLocation} 的天氣資料`,
      });
    }

    // 整理天氣資料
    const weatherData = {
      city: locationData.locationName,
      cityCode: cityCode, // 回傳代碼方便前端辨識
      updateTime: response.data.records.datasetDescription,
      forecasts: [],
    };

    // 解析天氣要素
    const weatherElements = locationData.weatherElement;
    const timeCount = weatherElements[0].time.length;

    for (let i = 0; i < timeCount; i++) {
      const forecast = {
        startTime: weatherElements[0].time[i].startTime,
        endTime: weatherElements[0].time[i].endTime,
        weather: "",
        rain: "",
        minTemp: "",
        maxTemp: "",
        comfort: "",
        windSpeed: "",
      };

      weatherElements.forEach((element) => {
        const value = element.time[i].parameter;
        switch (element.elementName) {
          case "Wx":
            forecast.weather = value.parameterName;
            break;
          case "PoP":
            forecast.rain = value.parameterName + "%";
            break;
          case "MinT":
            forecast.minTemp = value.parameterName + "°C";
            break;
          case "MaxT":
            forecast.maxTemp = value.parameterName + "°C";
            break;
          case "CI":
            forecast.comfort = value.parameterName;
            break;
          case "WS":
            forecast.windSpeed = value.parameterName;
            break;
        }
      });

      weatherData.forecasts.push(forecast);
    }

    res.json({
      success: true,
      data: weatherData,
    });
  } catch (error) {
    console.error("取得天氣資料失敗:", error.message);

    if (error.response) {
      return res.status(error.response.status).json({
        error: "CWA API 錯誤",
        message: error.response.data.message || "無法取得天氣資料",
      });
    }

    res.status(500).json({
      error: "伺服器錯誤",
      message: "無法取得天氣資料，請稍後再試",
    });
  }
};

// Routes
app.get("/", (req, res) => {
  res.json({
    message: "歡迎使用 CWA 天氣預報 API (六都版)",
    endpoints: {
      taipei: "/api/weather/taipei",
      new_taipei: "/api/weather/new_taipei",
      taoyuan: "/api/weather/taoyuan",
      taichung: "/api/weather/taichung",
      tainan: "/api/weather/tainan",
      kaohsiung: "/api/weather/kaohsiung",
    },
  });
});

app.get("/api/health", (req, res) => {
  res.json({ status: "OK", timestamp: new Date().toISOString() });
});

// === 核心修改：將單一路徑改成動態參數路徑 ===
// :city 代表這是一個變數，任何 /api/weather/xxx 都會進到這裡
app.get("/api/weather/:city", getCityWeather);

// Error handling middleware
app.use((err, req, res, next) => {
  console.error(err.stack);
  res.status(500).json({
    error: "伺服器錯誤",
    message: err.message,
  });
});

// 404 handler
app.use((req, res) => {
  res.status(404).json({
    error: "找不到此路徑",
  });
});

app.listen(PORT, () => {
  console.log(`🚀 伺服器已啟動，監聽 Port: ${PORT}`);
  console.log(`📍 測試連結: http://localhost:${PORT}/api/weather/taipei`);
});