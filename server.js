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

// === 核心修改：全臺 22 縣市代碼對照表 ===
// 包含 6 直轄市、3 市、13 縣
const CITY_MAP = {
  // === 六都 (直轄市) ===
  taipei: "臺北市",
  new_taipei: "新北市",
  taoyuan: "桃園市",
  taichung: "臺中市",
  tainan: "臺南市",
  kaohsiung: "高雄市",

  // === 北部其他縣市 ===
  keelung: "基隆市",
  hsinchu_city: "新竹市",
  hsinchu_county: "新竹縣",
  yilan: "宜蘭縣",

  // === 中部其他縣市 ===
  miaoli: "苗栗縣",
  changhua: "彰化縣",
  nantou: "南投縣",
  yunlin: "雲林縣",

  // === 南部其他縣市 ===
  chiayi_city: "嘉義市",
  chiayi_county: "嘉義縣",
  pingtung: "屏東縣",

  // === 東部 ===
  hualien: "花蓮縣",
  taitung: "臺東縣",

  // === 外島 ===
  penghu: "澎湖縣",
  kinmen: "金門縣",
  lienchiang: "連江縣"
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
        message: `不支援 '${cityCode}'。請使用正確的城市代碼 (例如: taipei, hualien, penghu...)`,
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
          locationName: targetLocation, // 使用映射後的中文名稱
        },
      }
    );

    // 取得該城市的天氣資料
    const locationData = response.data.records.location[0];

    if (!locationData) {
      return res.status(404).json({
        error: "查無資料",
        message: `無法取得 ${targetLocation} 的天氣資料，請確認 CWA API 來源是否正常。`,
      });
    }

    // 整理天氣資料
    const weatherData = {
      city: locationData.locationName,
      cityCode: cityCode, 
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

// Routes - 首頁顯示所有可用連結
app.get("/", (req, res) => {
  const protocol = req.protocol;
  const host = req.get('host');
  const baseUrl = `${protocol}://${host}/api/weather/`;

  res.json({
    message: "歡迎使用全臺天氣預報 API",
    usage: "請在網址後方加上城市代碼",
    example: `${baseUrl}taipei`,
    available_cities: Object.keys(CITY_MAP).reduce((acc, key) => {
        acc[key] = `${baseUrl}${key}`;
        return acc;
    }, {})
  });
});

app.get("/api/health", (req, res) => {
  res.json({ status: "OK", timestamp: new Date().toISOString() });
});

// 動態路由：處理所有城市請求
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
    message: "請確認網址是否正確"
  });
});

app.listen(PORT, () => {
  console.log(`🚀 伺服器已啟動，監聽 Port: ${PORT}`);
  console.log(`📍 支援全臺 22 縣市天氣查詢`);
});