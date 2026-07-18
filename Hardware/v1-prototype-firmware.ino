 #include <Arduino.h>
 #include <FS.h>
 #include <LittleFS.h>
 #include <NimBLEDevice.h>
 #include <max6675.h>
 #include <TinyGPSPlus.h>
 #include <Adafruit_NeoPixel.h>
 #include <WiFi.h>
 #include <WebServer.h>
 #include <time.h>
 #include <stdarg.h>
 
 // ─── BLE UUIDs ────────────────────────────────────────────────────────────────
 
 #define SERVICE_UUID       "4fafc201-1fb5-459e-8fcc-c5c9c331914b"
 #define CHAR_KILN_ID       "beb5483e-36e1-4688-b7f5-ea07361b26a8"
 #define CHAR_TEMP          "beb5483e-36e1-4688-b7f5-ea07361b26a9"
 #define CHAR_STORAGE_INFO  "a3b3d8e6-3f2e-4d7c-b5a1-9e8f7c6d5e4f"
 #define CHAR_UPTIME        "e5f6a7b8-c9d0-4e1f-2a3b-4c5d6e7f8a9b"
 #define CHAR_FILE_DOWNLOAD "d4e5f6a7-b8c9-4d0e-1f2a-3b4c5d6e7f8a"
 #define CHAR_FILE_CMD      "beb5483e-36e1-4688-b7f5-ea07361b26aa"
 
 // ─── State Machine Config ─────────────────────────────────────────────────────
 
 enum KilnState { STANDBY = 0, ACTIVE = 1 };
 
 const unsigned long TICK_INTERVAL_MS      = 15000; 
 const float         ACTIVATION_THRESHOLD  = 60.0f;  
 const int           COOLDOWN_TICKS_NEEDED = 2;      
 const size_t        BLE_CHUNK_SIZE        = 200;    
 
 
 const char*    DEVICE_NAME          = "Kiln-ESP32";
 
 // WiFi-Serial
 static const char*    WIFI_AP_SSID    = "Kiln-ESP32";
 static const char*    WIFI_AP_PASS    = "krishe1234";
 static const uint16_t TELNET_PORT     = 23;
 static const uint16_t WEB_PORT        = 80;
 static const size_t   LOG_RING_SIZE   = 8192;
 
 WiFiServer telnetServer(TELNET_PORT);
 WebServer  webServer(WEB_PORT);
 WiFiClient telnetClient;
 static char     logRing[LOG_RING_SIZE];
 static uint32_t logTotalBytes = 0;
 static String   telnetInputLine;
 
 static const char MONITOR_HTML[] PROGMEM = R"HTML(<!DOCTYPE html>
<html lang="en"><head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width,initial-scale=1,maximum-scale=1">
<title>Kiln Serial Monitor</title>
<style>
*{box-sizing:border-box}
body{margin:0;background:#1a1a2e;color:#e0e0e0;font-family:Consolas,"Courier New",monospace}
header{padding:10px 14px;background:#16213e;border-bottom:1px solid #0f3460;font-size:14px}
header b{color:#53d8fb}
#log{height:calc(100vh - 120px);overflow:auto;padding:12px;white-space:pre-wrap;word-break:break-all;font-size:13px;line-height:1.45}
#bar{display:flex;gap:6px;padding:8px;background:#16213e;border-top:1px solid #0f3460;flex-wrap:wrap}
#cmd{flex:1;min-width:140px;padding:10px;background:#0f3460;color:#fff;border:1px solid #533483;border-radius:4px;font:inherit}
button{padding:10px 12px;background:#533483;color:#fff;border:none;border-radius:4px;font:inherit;cursor:pointer}
button:active{background:#6a44a0}
.q{background:#0e639c}
</style></head><body>
<header><b>Kiln-ESP32</b> serial monitor &mdash; live logs + commands</header>
<div id="log"></div>
<div id="bar">
<input id="cmd" placeholder="STATUS | LS | TEMP 68 | READ /batch_....json" autocomplete="off" spellcheck="false">
<button onclick="sendCmd()">Send</button>
<button class="q" onclick="quick('STATUS')">STATUS</button>
<button class="q" onclick="quick('LS')">LS</button>
<button class="q" onclick="quick('SENSOR')">SENSOR</button>
</div>
<script>
let pos=0;const logEl=document.getElementById("log"),cmdEl=document.getElementById("cmd");
async function poll(){try{const r=await fetch("/api/logs?since="+pos);const j=await r.json();
if(j.text){logEl.textContent+=j.text;logEl.scrollTop=logEl.scrollHeight;}pos=j.since;}catch(e){}}
setInterval(poll,350);poll();
async function sendRaw(c){c=c.trim();if(!c)return;await fetch("/api/cmd",{method:"POST",headers:{"Content-Type":"text/plain"},body:c});}
function sendCmd(){sendRaw(cmdEl.value);cmdEl.value="";cmdEl.focus();}
function quick(c){sendRaw(c);}
cmdEl.addEventListener("keydown",e=>{if(e.key==="Enter")sendCmd();});
</script></body></html>)HTML";
 
 // ─── WiFi / Web / Telnet Console ─────────────────────────────────────────────
 // All firmware logs go through Console:: and are mirrored to browser + telnet.
 
 static void appendLogRing(const uint8_t* data, size_t len) {
   for (size_t i = 0; i < len; i++) {
     logRing[logTotalBytes % LOG_RING_SIZE] = (char)data[i];
     logTotalBytes++;
   }
 }
 
 static void readLogFromPosition(uint32_t since, String& out, uint32_t& endPos) {
   uint32_t oldest = logTotalBytes > LOG_RING_SIZE ? logTotalBytes - LOG_RING_SIZE : 0;
   if (since > logTotalBytes) since = logTotalBytes;
   if (since < oldest) since = oldest;
   endPos = logTotalBytes;
   for (uint32_t p = since; p < logTotalBytes; p++) {
     out += logRing[p % LOG_RING_SIZE];
   }
 }
 
 static String jsonEscape(const String& s) {
   String out;
   out.reserve(s.length() + 16);
   for (size_t i = 0; i < s.length(); i++) {
     const char c = s[i];
     if (c == '\\') out += "\\\\";
     else if (c == '"') out += "\\\"";
     else if (c == '\n') out += "\\n";
     else if (c == '\r') out += "\\r";
     else if (c == '\t') out += "\\t";
     else out += c;
   }
   return out;
 }
 
 void handleConsoleCommand(const String& input);
 
 static void consoleWriteRaw(const uint8_t* data, size_t len) {
   if (len == 0) return;
   Serial.write(data, len);
   appendLogRing(data, len);
   if (telnetClient && telnetClient.connected()) {
     telnetClient.write(data, len);
   }
 }
 
 static void consoleWriteChar(uint8_t c) {
   consoleWriteRaw(&c, 1);
 }
 
 class Console {
 public:
   static void print(const char* s) { writeStr(s); }
   static void print(const String& s) { writeStr(s.c_str()); }
   static void println(const char* s = "") {
     writeStr(s);
     writeStr("\r\n");
   }
   static void println(const String& s) { println(s.c_str()); }
   static void printf(const char* fmt, ...) {
     char buf[384];
     va_list args;
     va_start(args, fmt);
     int n = vsnprintf(buf, sizeof(buf), fmt, args);
     va_end(args);
     if (n > 0) writeStr(buf);
   }
   static void write(uint8_t c) { consoleWriteChar(c); }
   static void write(const uint8_t* data, size_t len) { consoleWriteRaw(data, len); }
 
 private:
   static void writeStr(const char* s) {
     if (!s) return;
     consoleWriteRaw((const uint8_t*)s, strlen(s));
   }
 };
 
 void handleWebRoot() {
   webServer.send_P(200, "text/html", MONITOR_HTML);
 }
 
 void handleWebLogs() {
   uint32_t since = (uint32_t)webServer.arg("since").toInt();
   String text;
   uint32_t endPos = since;
   readLogFromPosition(since, text, endPos);
 
   String json = "{\"since\":";
   json += endPos;
   json += ",\"text\":\"";
   json += jsonEscape(text);
   json += "\"}";
   webServer.send(200, "application/json", json);
 }
 
 void handleWebCmd() {
   if (webServer.method() != HTTP_POST) {
     webServer.send(405, "text/plain", "POST only");
     return;
   }
 
   String cmd = webServer.arg("plain");
   cmd.trim();
   if (!cmd.isEmpty()) {
     Console::printf("[WEB] > %s\n", cmd.c_str());
     handleConsoleCommand(cmd);
   }
   webServer.send(200, "application/json", "{\"ok\":true}");
 }
 
 void setupWebMonitor() {
   webServer.on("/", HTTP_GET, handleWebRoot);
   webServer.on("/api/logs", HTTP_GET, handleWebLogs);
   webServer.on("/api/cmd", HTTP_POST, handleWebCmd);
   webServer.begin();
 }
 
 void setupWifiConsole() {
   WiFi.mode(WIFI_AP);
   WiFi.setSleep(false);
   WiFi.softAP(WIFI_AP_SSID, WIFI_AP_PASS);
 
   IPAddress apIp = WiFi.softAPIP();
   telnetServer.begin();
   telnetServer.setNoDelay(true);
   setupWebMonitor();
 
   Console::println();
   Console::println("[WIFI] Soft-AP active");
   Console::printf("[WIFI] SSID     : %s\n", WIFI_AP_SSID);
   Console::printf("[WIFI] Password : %s\n", WIFI_AP_PASS);
   Console::printf("[WIFI] IP       : %s\n", apIp.toString().c_str());
   Console::printf("[WIFI] Browser  : http://%s/\n", apIp.toString().c_str());
   Console::printf("[WIFI] Telnet   : %s:%u (optional)\n", apIp.toString().c_str(), TELNET_PORT);
   Console::println("[WIFI] Open the browser URL in Chrome on your phone or laptop.");
 }
 
 static void onTelnetConnected(WiFiClient& client) {
   client.setNoDelay(true);
   client.print("\r\n--- Krishe Kiln Telnet Console ---\r\n");
   String replay;
   uint32_t endPos = 0;
   uint32_t oldest = logTotalBytes > LOG_RING_SIZE ? logTotalBytes - LOG_RING_SIZE : 0;
   readLogFromPosition(oldest, replay, endPos);
   if (!replay.isEmpty()) {
     client.print(replay);
   }
   client.print("\r\nReady. Commands: TEMP SENSOR STATUS LS READ CLEAR\r\n> ");
 }
 
 void pollWifiConsole() {
   webServer.handleClient();
 
   WiFiClient newClient = telnetServer.available();
   if (newClient) {
     if (telnetClient) {
       telnetClient.stop();
     }
     telnetClient = newClient;
     telnetInputLine = "";
     onTelnetConnected(telnetClient);
   }
 
   if (!telnetClient || !telnetClient.connected()) {
     return;
   }
 
   while (telnetClient.available()) {
     char c = (char)telnetClient.read();
     if (c == '\r') continue;
 
     if (c == '\n') {
       String line = telnetInputLine;
       telnetInputLine = "";
       line.trim();
       if (!line.isEmpty()) {
         Console::printf("\r\n> %s\r\n", line.c_str());
         handleConsoleCommand(line);
       }
       telnetClient.print("> ");
     } else if (c == '\b' || c == 127) {
       if (!telnetInputLine.isEmpty()) {
         telnetInputLine.remove(telnetInputLine.length() - 1);
         telnetClient.print("\b \b");
       }
     } else if (telnetInputLine.length() < 120) {
       telnetInputLine += c;
       telnetClient.write(c);
     }
   }
 }
 
 const int THERMO_SO_PIN  = 6;
 const int THERMO_CS_PIN  = 7;
 const int THERMO_SCK_PIN = 5;
 
 const int GPS_RX_PIN     = 17;   // ESP32 RX ← GPS module TX
 const int GPS_TX_PIN     = 16;   // ESP32 TX → GPS module RX
 const uint32_t GPS_BAUD  = 9600;
 
 const int RGB_LED_PIN   = 48;   // WS2812 on ESP32-S3-DevKitC-1
 const int RGB_LED_COUNT = 1;
 const uint8_t LED_BRIGHTNESS = 40;  // 0–255; keep moderate for onboard LED
 
 Adafruit_NeoPixel statusRgb(RGB_LED_COUNT, RGB_LED_PIN, NEO_GRB + NEO_KHZ800);
 
 MAX6675     thermocouple(THERMO_SCK_PIN, THERMO_CS_PIN, THERMO_SO_PIN);
 TinyGPSPlus gps;
 HardwareSerial gpsSerial(1);
 
 // ─── GPS / Sensor Runtime State ───────────────────────────────────────────────
 
 float         currentTemp          = 25.0f;
 bool          tempOverrideActive   = false;  
 float         currentLatitude      = 0.0f;
 float         currentLongitude     = 0.0f;
 bool          gpsLocationValid     = false;  
 bool          gpsTimeValid         = false;  
 uint32_t      gpsEpochBaseSec      = 0;      
 unsigned long gpsEpochBaseMs       = 0;      
 
 // Last-known GPS date/time components
 static int gpsStoredYear  = 0;
 static int gpsStoredMonth = 0;
 static int gpsStoredDay   = 0;
 static int gpsStoredHour  = 0;
 static int gpsStoredMin   = 0;
 static int gpsStoredSec   = 0;
 static bool gpsHaveStoredDate = false;
 static bool gpsHaveStoredTime = false;
 
 static bool coordsAreNonZero() {
   return currentLatitude != 0.0f || currentLongitude != 0.0f;
 }
 
 static bool hasStoredUtcTime() {
   return gpsEpochBaseSec > 0;
 }
 
 static bool hasStoredLocation() {
   return coordsAreNonZero();
 }
 
 static bool isGpsReadyForBatch() {
   return hasStoredUtcTime() && hasStoredLocation();
 }
 
 // ─── Time Utility ─────────────────────────────────────────────────────────────
 
 static bool isLeapYear(int year) {
   return (year % 4 == 0 && year % 100 != 0) || (year % 400 == 0);
 }
 
 // Converts a Unix epoch (seconds since 1970-01-01T00:00:00Z) to an ISO 8601
 // UTC string: "YYYY-MM-DDTHH:MM:SSZ".
 static void epochToISO8601(char* buf, size_t len, uint32_t epochSec) {
   time_t t = (time_t)epochSec;
   struct tm* tm_info = gmtime(&t);
   strftime(buf, len, "%Y-%m-%dT%H:%M:%SZ", tm_info);
 }
 
 // Formats UTC epoch as batch_YYYYMMDDHHMMSS (used for batch_name and .json filename).
 // Uses snprintf — strftime needs 21 bytes for the 20-char slug + NUL; a [20] buf fails.
 static bool epochToBatchSlug(char* buf, size_t len, uint32_t epochSec) {
   if (epochSec == 0 || len < 21) return false;
 
   uint32_t rem = epochSec;
   const int second = (int)(rem % 60); rem /= 60;
   const int minute = (int)(rem % 60); rem /= 60;
   const int hour   = (int)(rem % 24); rem /= 24;
 
   int year = 1970;
   while (true) {
     const uint32_t daysInYear = isLeapYear(year) ? 366u : 365u;
     if (rem < daysInYear) break;
     rem -= daysInYear;
     year++;
   }
 
   static const int daysInMonth[] = {31, 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31};
   int month = 1;
   while (month <= 12) {
     int dim = daysInMonth[month - 1];
     if (month == 2 && isLeapYear(year)) dim = 29;
     if (rem < (uint32_t)dim) break;
     rem -= (uint32_t)dim;
     month++;
   }
   const int day = (int)rem + 1;
 
   const int n = snprintf(buf, len, "batch_%04d%02d%02d%02d%02d%02d",
     year, month, day, hour, minute, second);
   return n == 20;
 }
 
 // ─── Sensor Helpers ───────────────────────────────────────────────────────────
 
 static uint32_t gpsDateTimeToEpochUtc(int year, int month, int day,
                                       int hour, int minute, int second) {
   if (year < 1980 || month < 1 || month > 12 || day < 1 || day > 31) return 0;
   if (hour < 0 || hour > 23 || minute < 0 || minute > 59 || second < 0 || second > 59) return 0;
 
   static const int daysInMonth[] = {31, 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31};
   uint32_t days = 0;
   for (int y = 1970; y < year; y++) {
     days += isLeapYear(y) ? 366u : 365u;
   }
   for (int m = 1; m < month; m++) {
     days += (uint32_t)daysInMonth[m - 1];
     if (m == 2 && isLeapYear(year)) days += 1u;
   }
   days += (uint32_t)(day - 1);
 
   return days * 86400UL
        + (uint32_t)hour * 3600UL
        + (uint32_t)minute * 60UL
        + (uint32_t)second;
 }
 
 static void tryLatchGpsEpochFromComponents() {
   if (!gpsHaveStoredDate || !gpsHaveStoredTime) return;
 
   uint32_t epoch = gpsDateTimeToEpochUtc(
     gpsStoredYear, gpsStoredMonth, gpsStoredDay,
     gpsStoredHour, gpsStoredMin, gpsStoredSec);
   if (epoch == 0) return;
 
   gpsEpochBaseSec = epoch;
   gpsEpochBaseMs  = millis();
   gpsTimeValid    = true;
 }
 
 void setupSensors() {
   gpsSerial.begin(GPS_BAUD, SERIAL_8N1, GPS_RX_PIN, GPS_TX_PIN);
   Console::printf("[SENS] MAX6675 on SCK=%d CS=%d SO=%d\n",
     THERMO_SCK_PIN, THERMO_CS_PIN, THERMO_SO_PIN);
   Console::printf("[SENS] ATGM336H GPS on RX=%d TX=%d @ %lu baud\n",
     GPS_RX_PIN, GPS_TX_PIN, (unsigned long)GPS_BAUD);
 }
 
 void pollGps() {
   while (gpsSerial.available()) {
     if (!gps.encode(gpsSerial.read())) continue;
 
     // Latch coordinates from any update with non-zero values — do not require
     if (gps.location.isUpdated() || gps.location.isValid()) {
       const double lat = gps.location.lat();
       const double lng = gps.location.lng();
       if (lat != 0.0 || lng != 0.0) {
         currentLatitude  = (float)lat;
         currentLongitude = (float)lng;
         gpsLocationValid = true;
       }
     }
 
     // Latch date and time components independently, then build UTC epoch once both exist.
     if (gps.date.isUpdated() || gps.date.isValid()) {
       if (gps.date.year() >= 1980) {
         gpsStoredYear  = gps.date.year();
         gpsStoredMonth = gps.date.month();
         gpsStoredDay   = gps.date.day();
         gpsHaveStoredDate = true;
       }
     }
 
     if (gps.time.isUpdated() || gps.time.isValid()) {
       gpsStoredHour = gps.time.hour();
       gpsStoredMin  = gps.time.minute();
       gpsStoredSec  = gps.time.second();
       gpsHaveStoredTime = true;
     }
 
     tryLatchGpsEpochFromComponents();
   }
 }
 
 uint32_t getCurrentUtcEpochSec() {
   if (!hasStoredUtcTime()) return 0;
   return gpsEpochBaseSec + (uint32_t)((millis() - gpsEpochBaseMs) / 1000);
 }
 
 float readTemperature() {
   if (tempOverrideActive) return currentTemp;
 
   float temp = thermocouple.readCelsius();
   if (isnan(temp)) {
     Console::println("[SENS] Thermocouple read failed – keeping last value.");
     return currentTemp;
   }
   currentTemp = temp;
   return currentTemp;
 }
 
 // ─── Runtime State ────────────────────────────────────────────────────────────
 KilnState     currentKilnState     = STANDBY;
 unsigned long lastTickMs           = 0;
 int           cooldownTickCount    = 0;
 String        activeBatchSlug      = "";   // e.g. "batch_20260708120000"
 unsigned long batchStartUptimeSec  = 0;  // ESP32 uptime (seconds) when batch opened
 String        activeBatchFile      = "";  // "/temp_batch.json" while recording, "" otherwise
 bool          isFirstDataPoint     = true;
 volatile bool pendingFileDownload  = false;  // set by BLE callback, consumed in loop()
 String        pendingDownloadFile  = "";     // empty = latest .json; "GET" cmd sets this
 
 // ─── Status RGB LED (WS2812 on GPIO48) ───────────────────────────────────────
 
 void setupStatusLeds() {
   statusRgb.begin();
   statusRgb.setBrightness(LED_BRIGHTNESS);
   statusRgb.clear();
   statusRgb.show();
   Console::printf("[LED]  Onboard RGB WS2812 on GPIO%d  (RED=recording  GREEN=GPS ready)\n",
     RGB_LED_PIN);
 }
 
 void updateStatusLeds() {
   bool recording = (currentKilnState == ACTIVE) || !activeBatchFile.isEmpty();
   bool gpsReady  = isGpsReadyForBatch();
 
   uint8_t r = 0, g = 0, b = 0;
   if (recording) r = 255;
   if (gpsReady)  g = 255;
 
   statusRgb.setPixelColor(0, statusRgb.Color(r, g, b));
   statusRgb.show();
 }
 
 // ─── BLE Characteristic Pointers ─────────────────────────────────────────────
 
 NimBLEServer*         pServer        = nullptr;
 NimBLECharacteristic* pKilnIdChar    = nullptr;
 NimBLECharacteristic* pTempChar      = nullptr;
 NimBLECharacteristic* pStorageChar   = nullptr;
 NimBLECharacteristic* pUptimeChar    = nullptr;
 NimBLECharacteristic* pFileDownChar  = nullptr;
 NimBLECharacteristic* pFileCmdChar   = nullptr;
 
 // ─── Helper: Refresh All Readable Characteristics ────────────────────────────
 
 void refreshCharacteristics(unsigned long uptimeSec) {
   char tempStr[12];
   snprintf(tempStr, sizeof(tempStr), "%.2f", currentTemp);
   pTempChar->setValue(tempStr);
   pTempChar->notify();
 
   char storageStr[32];
   snprintf(storageStr, sizeof(storageStr), "%u,%u",
     (unsigned)LittleFS.usedBytes(),
     (unsigned)LittleFS.totalBytes());
   pStorageChar->setValue(storageStr);
 
   char uptimeStr[16];
   snprintf(uptimeStr, sizeof(uptimeStr), "%lu", uptimeSec);
   pUptimeChar->setValue(uptimeStr);
 }
 
 // ─── Batch File Helpers ───────────────────────────────────────────────────────
 
 // During recording, data is appended to /temp_batch.json.
 // On batch close the temp file is renamed to /batch_YYYYMMDDHHMMSS.json.
 
 bool openNewBatch(unsigned long uptimeSec) {
   batchStartUptimeSec = uptimeSec;
   activeBatchFile = "/temp_batch.json";
   activeBatchSlug = "";
 
   // Need stored UTC time and non-zero location (acquired once outdoors is enough).
   if (!isGpsReadyForBatch()) {
     Console::printf(
       "[BATCH] ERROR – GPS not ready: time=%s (epochBase=%lu) loc=%s (lat=%.6f lng=%.6f)\n",
       hasStoredUtcTime() ? "ok" : "missing", (unsigned long)gpsEpochBaseSec,
       hasStoredLocation() ? "ok" : "missing", currentLatitude, currentLongitude);
     activeBatchFile = "";
     return false;
   }
 
   uint32_t batchStartEpoch = getCurrentUtcEpochSec();
   char batchSlug[21];  // "batch_YYYYMMDDHHMMSS\0" = 20 chars + NUL
   if (batchStartEpoch == 0 || !epochToBatchSlug(batchSlug, sizeof(batchSlug), batchStartEpoch)) {
     Console::printf("[BATCH] ERROR – bad UTC epoch for slug: %lu\n", (unsigned long)batchStartEpoch);
     activeBatchFile = "";
     return false;
   }
   activeBatchSlug = String(batchSlug);
 
   File f = LittleFS.open("/temp_batch.json", FILE_WRITE);
   if (!f) {
     Console::println("[FS]  ERROR – could not create /temp_batch.json.");
     activeBatchSlug = "";
     activeBatchFile = "";
     return false;
   }
 
   char startTimeUTC[24];  // "YYYY-MM-DDTHH:MM:SSZ\0" = 21 chars
   epochToISO8601(startTimeUTC, sizeof(startTimeUTC), batchStartEpoch);
 
   float batchLat = currentLatitude;
   float batchLng = currentLongitude;
 
   // Write partial JSON header; data_points array is left open for appends.
   // ALL keys are snake_case to match the app's RawEspBatch TypeScript interface.
   //
   // Fields added for self-contained data provenance (no phone sensors needed):
   //   start_time_utc – absolute UTC timestamp from ATGM336H GPS
   //   latitude       – sensor location (°N) from ATGM336H
   //   longitude      – sensor location (°E) from ATGM336H
   f.printf(
     "{\"batch_name\":\"%s\","
     "\"kiln_id\":\"%s\","
     "\"uptime_start_seconds\":%lu,"
     "\"start_time_utc\":\"%s\","
     "\"latitude\":%.6f,"
     "\"longitude\":%.6f,"
     "\"data_points\":[",
     batchSlug, DEVICE_NAME, uptimeSec,
     startTimeUTC, batchLat, batchLng
   );
   f.close();
 
   isFirstDataPoint = true;
   Console::printf("[BATCH] Opened %s → /temp_batch.json  |  start=%s  lat=%.6f  lng=%.6f\n",
     batchSlug, startTimeUTC, batchLat, batchLng);
   return true;
 }
 
 void appendDataPoint(unsigned long uptimeSec, float temp) {
   if (activeBatchFile.isEmpty()) return;
 
   File f = LittleFS.open(activeBatchFile, FILE_APPEND);
   if (!f) {
     Console::println("[FS]  ERROR – could not append to batch file.");
     return;
   }
 
   unsigned long offsetSec = uptimeSec - batchStartUptimeSec;
 
   if (!isFirstDataPoint) f.print(",");
   f.printf("{\"time_offset_seconds\":%lu,\"temperature\":%.2f}", offsetSec, temp);
   f.close();
 
   isFirstDataPoint = false;
   Console::printf("[BATCH] Appended  offset=%lus  temp=%.2f°C\n", offsetSec, temp);
 }
 
 void closeBatch(unsigned long uptimeSec) {
   if (activeBatchFile.isEmpty()) return;
 
   File f = LittleFS.open(activeBatchFile, FILE_APPEND);
   if (!f) {
     Console::println("[FS]  ERROR – could not close batch file.");
     return;
   }
 
   unsigned long durationSec = uptimeSec - batchStartUptimeSec;
   f.printf("],\"duration_seconds\":%lu}", durationSec);
   f.close();
 
   if (activeBatchSlug.isEmpty()) {
     Console::println("[BATCH] ERROR – active batch slug missing. Discarding temp file.");
     LittleFS.remove("/temp_batch.json");
     activeBatchFile = "";
     return;
   }
 
   String finalPath = "/" + activeBatchSlug + ".json";
   if (!LittleFS.rename("/temp_batch.json", finalPath)) {
     Console::printf("[BATCH] ERROR – could not rename to %s\n", finalPath.c_str());
     activeBatchFile = "";
     return;
   }
 
   Console::printf("[BATCH] Closed %s  |  duration=%lus  |  saved as %s\n",
     activeBatchSlug.c_str(), durationSec, finalPath.c_str());
 
   activeBatchSlug = "";
   activeBatchFile = "";
 }
 
 // ─── CRC-32 (transport integrity) ─────────────────────────────────────────────
 //
 // Standard CRC-32 (IEEE 802.3, reflected, poly 0xEDB88320, init/final 0xFFFFFFFF)
 // computed incrementally over the file. The mobile app recomputes the same CRC
 // over the reassembled bytes; a mismatch means the BLE transfer corrupted the
 // payload in flight, so the app re-requests it instead of storing a corrupt
 // JSON file. MUST stay byte-for-byte identical to crc32Hex() in the
 // app's BleManagerService.ts.
 static uint32_t crc32Step(uint32_t crc, const uint8_t* data, size_t len) {
   for (size_t i = 0; i < len; i++) {
     crc ^= data[i];
     for (int k = 0; k < 8; k++) {
       crc = (crc >> 1) ^ (0xEDB88320u & (0u - (crc & 1u)));
     }
   }
   return crc;
 }
 
 // ─── FILE_DOWNLOAD Streaming ──────────────────────────────────────────────────
 //
 // Streams any LittleFS JSON batch file as BLE notifications:
 //   1. "LEN:<n> CRC:<8-hex>\n"  – byte count + CRC-32 of the file
 //   2. File bytes               – in BLE_CHUNK_SIZE chunks (binary-safe)
 //   3. 0x00                     – null EOF sentinel
 //
 // The recipient (mobile app) receives raw JSON bytes and verifies the CRC.
 void streamFileToApp(const String& filename) {
   File f = LittleFS.open(filename, FILE_READ);
   if (!f) {
     Console::printf("[DL]  ERROR – cannot open %s\n", filename.c_str());
     return;
   }
 
   int fileSize = (int)f.size();
 
   // First pass: CRC-32 the whole file so the app can detect a corrupted transfer.
   uint32_t crc = 0xFFFFFFFF;
   {
     uint8_t crcbuf[256];
     while (f.available()) {
       size_t n = f.readBytes((char*)crcbuf, sizeof(crcbuf));
       crc = crc32Step(crc, crcbuf, n);
     }
     crc ^= 0xFFFFFFFF;
     f.seek(0);
   }
 
   Console::printf("[DL]  Streaming %s  (%d bytes, CRC32=%08X)\n",
     filename.c_str(), fileSize, (unsigned)crc);
 
   char header[48];
   snprintf(header, sizeof(header), "LEN:%d CRC:%08X\n", fileSize, (unsigned)crc);
   const size_t headerLen = strlen(header);
   pFileDownChar->setValue((uint8_t*)header, headerLen);
   pFileDownChar->notify();
   delay(20);
 
   uint8_t buf[BLE_CHUNK_SIZE];
   while (f.available()) {
     size_t n = f.readBytes((char*)buf, BLE_CHUNK_SIZE);
     pFileDownChar->setValue(buf, n);
     pFileDownChar->notify();
     delay(20);
   }
   f.close();
 
   uint8_t eof = 0x00;
   pFileDownChar->setValue(&eof, 1);
   pFileDownChar->notify();
   Console::println("[DL]  Complete. EOF sent.");
 }
 
 // ─── Empty payload helper ─────────────────────────────────────────────────────
 
 // Sends a well-formed JSON EOF payload when there is nothing to stream.
 // Without this the app would hang indefinitely waiting for the EOF sentinel.
 static void sendEmptyPayload() {
   const char* emptyPayload =
     "{\"batch_name\":\"none\",\"kiln_id\":\"Kiln-ESP32\","
     "\"uptime_start_seconds\":0,\"duration_seconds\":0,"
     "\"data_points\":[]}";
   size_t payloadLen = strlen(emptyPayload);
 
   char header[32];
   snprintf(header, sizeof(header), "LEN:%d\n", (int)payloadLen);
   const size_t headerLen = strlen(header);
   pFileDownChar->setValue((uint8_t*)header, headerLen);
   pFileDownChar->notify();
   delay(20);
   pFileDownChar->setValue((uint8_t*)emptyPayload, payloadLen);
   pFileDownChar->notify();
   delay(20);
   uint8_t eof = 0x00;
   pFileDownChar->setValue(&eof, 1);
   pFileDownChar->notify();
 }
 
 // ─── File Download Request Handler ───────────────────────────────────────────
 
 // Handles a pending download request triggered by:
 //   (a) app subscribing to FILE_DOWNLOAD → stream the latest /batch_YYYYMMDDHHMMSS.json
 //   (b) app writing "GET <filename>" to FILE_CMD → stream that exact file
 //
 // Scan-based discovery for (a) picks the lexicographically greatest batch_*.json
 // name, which equals the most recent UTC start time for YYYYMMDDHHMMSS slugs.
 void handleFileDownloadRequest() {
   // ── Case (b): specific .json file requested via GET command ──────────────────
   if (!pendingDownloadFile.isEmpty()) {
     String target = pendingDownloadFile;
     pendingDownloadFile = "";  // consume immediately
 
     if (!LittleFS.exists(target)) {
       Console::printf("[DL]  GET: file not found: %s → sending empty payload.\n", target.c_str());
       sendEmptyPayload();
       return;
     }
 
     Console::printf("[DL]  GET: streaming %s\n", target.c_str());
     streamFileToApp(target);
     return;
   }
 
   // ── Case (a): no specific file – stream the latest completed .json batch ─────
   // /temp_batch.json is the active (still-open) recording file; skip it.
   String latestName = "";
   File root = LittleFS.open("/");
   File entry = root.openNextFile();
   while (entry) {
     if (!entry.isDirectory()) {
       String fname = String(entry.name());
       if (fname.startsWith("batch_") && fname.endsWith(".json")) {
         if (latestName.isEmpty() || fname > latestName) {
           latestName = fname;
         }
       }
     }
     entry = root.openNextFile();
   }
 
   if (latestName.isEmpty()) {
     Console::println("[DL]  No completed .json batches on flash. Sending empty payload.");
     sendEmptyPayload();
     return;
   }
 
   String filename = "/" + latestName;
   Console::printf("[DL]  Streaming latest: %s\n", filename.c_str());
   streamFileToApp(filename);
 }
 
 // ─── Callbacks: FILE_DOWNLOAD Subscription ────────────────────────────────────
 
 class FileDownCallbacks : public NimBLECharacteristicCallbacks {
   void onSubscribe(NimBLECharacteristic* pChar,
                    NimBLEConnInfo& connInfo,
                    uint16_t subValue) override {
     if (subValue == 1) {
       Console::println("[DL]  App subscribed to FILE_DOWNLOAD → queuing stream.");
       pendingFileDownload = true;
     } else {
       Console::println("[DL]  App unsubscribed from FILE_DOWNLOAD.");
     }
   }
 };
 
 // ─── Callbacks: FILE_CMD (LIST / GET / CLEAR) ─────────────────────────────────
 
 class FileCmdCallbacks : public NimBLECharacteristicCallbacks {
   void onWrite(NimBLECharacteristic* pChar, NimBLEConnInfo& connInfo) override {
     String cmd = String(pChar->getValue().c_str());
     cmd.trim();
     Console::printf("[CMD] Received: \"%s\"\n", cmd.c_str());
 
     // ── LIST ─────────────────────────────────────────────────────────────────
     if (cmd.equalsIgnoreCase("LIST")) {
       String listing = "";
       File root = LittleFS.open("/");
       File entry = root.openNextFile();
 
       while (entry) {
         if (!entry.isDirectory()) {
           if (listing.length() > 0) listing += ",";
           String fname = String(entry.name());
           listing += fname;
           listing += " (";
           listing += String(entry.size());
           listing += "B)";
           // Mark the active temp file so the app shows the RECORDING badge
           if (("/" + fname) == activeBatchFile) {
             listing += "*";
           }
         }
         entry = root.openNextFile();
       }
 
       if (listing.isEmpty()) listing = "EMPTY";
       pChar->setValue(listing.c_str());
       pChar->notify();
       Console::printf("[CMD] LIST → \"%s\"\n", listing.c_str());
     }
 
     // ── GET <filename> ────────────────────────────────────────────────────────
     else if (cmd.startsWith("GET ")) {
       String filename = cmd.substring(4);
       filename.trim();
       if (!filename.startsWith("/")) filename = "/" + filename;
       if (LittleFS.exists(filename)) {
         pendingDownloadFile = filename;
         Console::printf("[CMD] GET queued: %s\n", filename.c_str());
       } else {
         Console::printf("[CMD] GET: file not found: %s\n", filename.c_str());
       }
     }
 
     // ── CLEAR ─────────────────────────────────────────────────────────────────
     else if (cmd.equalsIgnoreCase("CLEAR")) {
       Console::println("[CMD] CLEAR – deleting completed batches…");
 
       if (currentKilnState == ACTIVE) {
         // activeBatchFile == "/temp_batch.json" → activeShortName == "temp_batch.json"
         // All other files (completed .json batches) will be deleted.
         String activeShortName = activeBatchFile.substring(1);
 
         String toDelete[32];
         int deleteCount = 0;
 
         File root = LittleFS.open("/");
         File entry = root.openNextFile();
         while (entry && deleteCount < 32) {
           if (!entry.isDirectory()) {
             String fname = String(entry.name());
             if (fname != activeShortName) {
               toDelete[deleteCount++] = "/" + fname;
             }
           }
           entry = root.openNextFile();
         }
         root.close();
 
         for (int i = 0; i < deleteCount; i++) {
           LittleFS.remove(toDelete[i]);
           Console::printf("[CMD] Deleted: %s\n", toDelete[i].c_str());
         }
 
         // Active recording slug is preserved; it is assigned when the batch opens.
         Console::printf("[CMD] Active recording preserved: %s  |  Cleared %d file(s).\n",
           activeBatchFile.c_str(), deleteCount);
 
       } else {
         LittleFS.format();
         if (!LittleFS.begin(false)) {
           Console::println("[FS]  ERROR – re-mount after format failed.");
         }
         activeBatchSlug = "";
         activeBatchFile = "";
         Console::println("[CMD] Flash formatted.");
       }
 
       pChar->setValue("WIPE_SUCCESS");
       pChar->notify();
       Console::println("[CMD] WIPE_SUCCESS sent to app.");
     }
 
     else {
       Console::printf("[CMD] Unknown command: \"%s\"\n", cmd.c_str());
     }
   }
 };
 
 // ─── Server Callbacks (auto-restart advertising on disconnect) ────────────────
 
 class KilnServerCallbacks : public NimBLEServerCallbacks {
   void onDisconnect(NimBLEServer* pSrv,
                     NimBLEConnInfo& connInfo,
                     int reason) override {
     Console::printf("[BLE]  Client disconnected (reason 0x%02X). Restarting advertising…\n",
       reason);
     NimBLEDevice::startAdvertising();
   }
 };
 
 // ─── BLE Initialisation ───────────────────────────────────────────────────────
 
 void setupBLE() {
   // Do NOT call NimBLEDevice::setMTU(517) here — on ESP32-S3 it can assert/panic
   // during init or MTU exchange and cause a reboot loop.  The phone app requests
   // MTU 512 on connect; the stack negotiates the minimum of both sides.
   NimBLEDevice::init(DEVICE_NAME);
 
   pServer = NimBLEDevice::createServer();
   pServer->setCallbacks(new KilnServerCallbacks());
   NimBLEService* pSvc = pServer->createService(SERVICE_UUID);
 
   pKilnIdChar = pSvc->createCharacteristic(
     CHAR_KILN_ID, NIMBLE_PROPERTY::READ | NIMBLE_PROPERTY::NOTIFY);
   pKilnIdChar->setValue(DEVICE_NAME);
 
   pTempChar = pSvc->createCharacteristic(
     CHAR_TEMP, NIMBLE_PROPERTY::READ | NIMBLE_PROPERTY::NOTIFY);
   pTempChar->setValue("25.00");
 
   pStorageChar = pSvc->createCharacteristic(
     CHAR_STORAGE_INFO, NIMBLE_PROPERTY::READ);
   char initStorage[32];
   snprintf(initStorage, sizeof(initStorage), "%u,%u",
     (unsigned)LittleFS.usedBytes(), (unsigned)LittleFS.totalBytes());
   pStorageChar->setValue(initStorage);
 
   pUptimeChar = pSvc->createCharacteristic(
     CHAR_UPTIME, NIMBLE_PROPERTY::READ);
   pUptimeChar->setValue("0");
 
   pFileDownChar = pSvc->createCharacteristic(
     CHAR_FILE_DOWNLOAD, NIMBLE_PROPERTY::NOTIFY);
   pFileDownChar->setCallbacks(new FileDownCallbacks());
 
   pFileCmdChar = pSvc->createCharacteristic(
     CHAR_FILE_CMD, NIMBLE_PROPERTY::WRITE | NIMBLE_PROPERTY::NOTIFY);
   pFileCmdChar->setCallbacks(new FileCmdCallbacks());
 
   pSvc->start();
 
   // ── Advertising ────────────────────────────────────────────────────────────
   // Name in main packet (fits), UUID in scan response (18 B fits in 31 B).
   // Interval: 2000 ms = 3200 × 0.625 ms units.  Duration 0 = infinite.
   NimBLEAdvertising* pAdv = NimBLEDevice::getAdvertising();
   pAdv->setMinInterval(3200);
   pAdv->setMaxInterval(3200);
 
   NimBLEAdvertisementData advData;
   advData.setName(DEVICE_NAME);
   NimBLEAdvertisementData scanData;
   scanData.setCompleteServices(NimBLEUUID(SERVICE_UUID));
   pAdv->setAdvertisementData(advData);
   pAdv->setScanResponseData(scanData);
   pAdv->start(0);
 
   Console::println("[BLE]  GATT server active. Advertising as 'Kiln-ESP32'.");
   Console::printf( "[BLE]  Interval     : 2000 ms (3200 × 0.625 ms units)\n");
   Console::printf( "[BLE]  Service UUID : %s\n", SERVICE_UUID);
 }
 
 // ─── Serial Command Parser ────────────────────────────────────────────────────
 
 void handleConsoleCommand(const String& input) {
   if (input.isEmpty()) return;
 
   // TEMP <float> – debug override for thermocouple reading
   if (input.startsWith("TEMP ")) {
     String arg = input.substring(5);
     arg.trim();
     if (arg.equalsIgnoreCase("SENSOR") || arg.equalsIgnoreCase("AUTO")) {
       tempOverrideActive = false;
       currentTemp = readTemperature();
       Console::printf("[SER]  Temp override cleared → sensor: %.2f°C\n", currentTemp);
     } else {
       currentTemp = arg.toFloat();
       tempOverrideActive = true;
       Console::printf("[SER]  Temp override → %.2f°C  (send SENSOR to resume)\n", currentTemp);
     }
   }
 
   // SENSOR – resume live thermocouple readings
   else if (input.equalsIgnoreCase("SENSOR")) {
     tempOverrideActive = false;
     currentTemp = readTemperature();
     Console::printf("[SER]  Live sensor resumed → %.2f°C\n", currentTemp);
   }
 
   // STATUS
   else if (input.equalsIgnoreCase("STATUS")) {
     Console::println("─────────────────────────────────────────");
     Console::printf( "  State         : %s\n",
       currentKilnState == ACTIVE ? "ACTIVE" : "STANDBY");
     Console::printf( "  Temperature   : %.2f°C%s\n", currentTemp,
       tempOverrideActive ? " (override)" : "");
     Console::printf( "  GPS location  : %s", hasStoredLocation() ? "STORED" : "WAITING");
     if (hasStoredLocation()) {
       Console::printf("  lat=%.6f  lng=%.6f", currentLatitude, currentLongitude);
     }
     Console::println();
     Console::printf( "  GPS time      : %s", hasStoredUtcTime() ? "STORED" : "WAITING");
     if (hasStoredUtcTime()) {
       char utcBuf[24];
       epochToISO8601(utcBuf, sizeof(utcBuf), getCurrentUtcEpochSec());
       Console::printf("  UTC=%s", utcBuf);
     }
     Console::println();
     Console::printf( "  GPS sats (live): %d\n",
       gps.satellites.isValid() ? gps.satellites.value() : 0);
     Console::printf( "  Batch GPS ready: %s\n", isGpsReadyForBatch() ? "yes" : "no");
     Console::printf( "  Active batch  : %s\n",
       activeBatchSlug.isEmpty() ? "(none)" : activeBatchSlug.c_str());
     Console::printf( "  Cooldown ticks: %d / %d\n",
       cooldownTickCount, COOLDOWN_TICKS_NEEDED);
     Console::printf( "  Active file   : %s\n",
       activeBatchFile.isEmpty() ? "(none)" : activeBatchFile.c_str());
     Console::printf( "  LittleFS used : %u / %u bytes\n",
       (unsigned)LittleFS.usedBytes(), (unsigned)LittleFS.totalBytes());
     Console::printf( "  WiFi AP       : %s  (%s)\n",
       WIFI_AP_SSID, WiFi.softAPIP().toString().c_str());
     Console::printf( "  Web monitor   : http://%s/\n",
       WiFi.softAPIP().toString().c_str());
     Console::printf( "  Telnet        : %s:%u\n",
       WiFi.softAPIP().toString().c_str(), TELNET_PORT);
     Console::printf( "  Telnet client : %s\n",
       (telnetClient && telnetClient.connected()) ? "connected" : "waiting");
     Console::println("─────────────────────────────────────────");
   }
 
   // LS – list all files
   else if (input.equalsIgnoreCase("LS")) {
     Console::println("[FS]  LittleFS contents:");
     File root = LittleFS.open("/");
     File entry = root.openNextFile();
     bool found = false;
     while (entry) {
       if (!entry.isDirectory()) {
         String tag = "";
         String fname = String(entry.name());
         if (fname.endsWith(".json") && fname != "temp_batch.json") tag = "  [completed batch]";
         else if (fname == "temp_batch.json") tag = "  [active recording]";
         Console::printf("  %-32s  %6d bytes%s\n",
           entry.name(), (int)entry.size(), tag.c_str());
         found = true;
       }
       entry = root.openNextFile();
     }
     if (!found) Console::println("  (empty)");
   }
 
   // READ <filename> – text dump of any JSON batch file
   else if (input.startsWith("READ ")) {
     String filename = input.substring(5);
     filename.trim();
     if (!filename.startsWith("/")) filename = "/" + filename;
 
     File f = LittleFS.open(filename, FILE_READ);
     if (!f) {
       Console::printf("[FS]  ERROR – could not open %s\n", filename.c_str());
       return;
     }
 
     int fsize = (int)f.size();
     Console::printf("\n─── Contents of %s (%d bytes) ───\n", filename.c_str(), fsize);
     while (f.available()) Console::write(f.read());
     Console::println("\n──────────────────────────────────────\n");
     f.close();
   }
 
   // CLEAR – dev tool: hard wipe (closes active batch first if needed)
   else if (input.equalsIgnoreCase("CLEAR")) {
     Console::println("[SER]  CLEAR – wiping LittleFS…");
     if (currentKilnState == ACTIVE) {
       unsigned long nowSec = millis() / 1000;
       closeBatch(nowSec);  // finalizes → writes .json → clears temp file
       currentKilnState = STANDBY;
       cooldownTickCount = 0;
       Console::println("[SER]  Active batch closed and saved before wipe.");
     }
     LittleFS.format();
     if (!LittleFS.begin(false)) {
       Console::println("[FS]  ERROR – re-mount after format failed.");
     } else {
       activeBatchSlug = "";
       activeBatchFile = "";
       Console::println("[SER]  Flash wiped.");
     }
   }
 
   else {
     Console::printf("[SER]  Unknown: \"%s\"  |  valid: TEMP <n>, SENSOR, STATUS, LS, READ <f>, CLEAR\n",
       input.c_str());
   }
 }
 
 // ─── Main Tick ────────────────────────────────────────────────────────────────
 
 void runTick(unsigned long uptimeSec) {
   currentTemp = readTemperature();
   refreshCharacteristics(uptimeSec);
 
   Console::printf(
     "\n[TICK] uptime=%lus | temp=%.2f°C | gps=%s | state=%s | cooldown=%d/%d\n",
     uptimeSec, currentTemp,
     isGpsReadyForBatch() ? "READY" : "WAIT",
     currentKilnState == ACTIVE ? "ACTIVE" : "STANDBY",
     cooldownTickCount, COOLDOWN_TICKS_NEEDED
   );
 
   if (currentTemp >= ACTIVATION_THRESHOLD) {
     cooldownTickCount = 0;
     if (currentKilnState == STANDBY) {
       Console::printf("[SM]   %.2f°C ≥ %.0f°C → ACTIVE. Opening new batch…\n",
         currentTemp, ACTIVATION_THRESHOLD);
       currentKilnState = ACTIVE;
       if (!openNewBatch(uptimeSec)) {
         currentKilnState = STANDBY;
         Console::println("[SM]   Batch open deferred – waiting for stored GPS UTC + location.");
       }
     }
     if (currentKilnState == ACTIVE) {
       appendDataPoint(uptimeSec, currentTemp);
     }
 
   } else {
     if (currentKilnState == ACTIVE) {
       appendDataPoint(uptimeSec, currentTemp);
       cooldownTickCount++;
       Console::printf("[SM]   %.2f°C < %.0f°C – cooldown tick %d/%d\n",
         currentTemp, ACTIVATION_THRESHOLD,
         cooldownTickCount, COOLDOWN_TICKS_NEEDED);
       if (cooldownTickCount >= COOLDOWN_TICKS_NEEDED) {
         Console::println("[SM]   Cooldown complete → STANDBY. Closing + saving batch.");
         currentKilnState = STANDBY;
         closeBatch(uptimeSec);
         cooldownTickCount = 0;
       }
     }
   }
 }
 
 // ─── Existing Batch Inventory ────────────────────────────────────────────────
 // Logs how many completed /batch_YYYYMMDDHHMMSS.json files are on flash.
 
 void logExistingBatches() {
   int count = 0;
   File root = LittleFS.open("/");
   File entry = root.openNextFile();
   while (entry) {
     if (!entry.isDirectory()) {
       String fname = String(entry.name());
       if (fname.startsWith("batch_") && fname.endsWith(".json")) {
         count++;
       }
     }
     entry = root.openNextFile();
   }
   if (count > 0) {
     Console::printf("[FS]  Found %d completed .json batch(es) on flash.\n", count);
   } else {
     Console::println("[FS]  No existing .json batches found.");
   }
 }
 
 // ─── Arduino Setup ────────────────────────────────────────────────────────────
 
 void setup() {
   Serial.begin(115200);
   delay(500);
   setupWifiConsole();
 
   Console::println();
   Console::println("╔══════════════════════════════════════╗");
   Console::println("║  Krishe Carbon – ESP32-S3 Firmware   ║");
   Console::println("║  Plain JSON + WiFi Web Console       ║");
   Console::println("╚══════════════════════════════════════╝");
   Console::println("Console : http://192.168.4.1/  (join Kiln-ESP32 WiFi first)");
   Console::println("Commands: TEMP <°C>  |  SENSOR  |  STATUS  |  LS  |  READ <f>  |  CLEAR");
   Console::println("Sensors : MAX6675 thermocouple + ATGM336H GPS");
   Console::println();
 
   setupSensors();
   setupStatusLeds();
 
   if (!LittleFS.begin(true, "/littlefs", 10, "ffat")) {
     Console::println("[FS]  FATAL – LittleFS mount failed. Halting.");
     while (true) delay(1000);
   }
   Console::printf("[FS]  Mounted. Used: %u / %u bytes.\n",
     (unsigned)LittleFS.usedBytes(), (unsigned)LittleFS.totalBytes());
 
   logExistingBatches();
   setupBLE();
   Console::println("[BOOT] Ready. Tick: 5 s. Threshold: 60°C. Batches: plain JSON.");
   Console::println("[BOOT] Waiting for GPS fix (outdoors / clear sky helps)…\n");
 }
 
 // ─── Arduino Loop ─────────────────────────────────────────────────────────────
 
 void loop() {
   pollGps();
   updateStatusLeds();
   pollWifiConsole();
 
   if (pendingFileDownload) {
     pendingFileDownload = false;
     handleFileDownloadRequest();
   }
 
   unsigned long nowMs = millis();
   if (nowMs - lastTickMs >= TICK_INTERVAL_MS) {
     lastTickMs = nowMs;
     runTick(nowMs / 1000);
   }
 }
 