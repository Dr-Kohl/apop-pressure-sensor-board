#include <Arduino.h>
#include <SPI.h>
#include "Pins.h"

// USB protocol 1: newline commands, one JSON reply per command. No streaming
// starts at boot. The original firmware remains in SensorBoard-main.
static const char VERSION[] = "usb-0.4.0";
static const uint8_t pressurePins[] = {PRESS_1_CS,PRESS_2_CS,PRESS_3_CS,PRESS_4_CS};
static uint8_t pressureRanges[] = {5,5,5,5};
static const uint8_t temperaturePins[] = {TEMP_1_CS,TEMP_2_CS,TEMP_3_CS,TEMP_4_CS};
static char commandBuffer[96];
static size_t commandLength = 0;
static bool overflowed = false;
static uint32_t lastByteMs = 0;

struct PressureReading { bool valid; int16_t raw; char model[9]; };
PressureReading readPressure(uint8_t pin) {
  uint8_t data[12];
  // ND datasheet: mode 1, byte spacing >=100 us, clock period >=6 us.
  // 90 selects 5 psi on ND030D, 2 Hz bandwidth, notch enabled.
  SPI.beginTransaction(SPISettings(100000,MSBFIRST,SPI_MODE1));
  digitalWrite(pin,LOW); delayMicroseconds(200);
  for(size_t i=0;i<sizeof(data);i++) {
    uint8_t range=5;
    for(uint8_t n=0;n<4;n++) if(pressurePins[n]==pin) range=pressureRanges[n];
    // ND030D range codes: 0=5 psi, 2=10 psi, 6=30 psi.
    // Rate byte 01 keeps DAV at 444 Hz, rather than auto selecting ~6 Hz.
    data[i]=SPI.transfer(i==0 ? (0x90 | (range==30 ? 6 : range==10 ? 2 : 0)) : i==1 ? 0x01 : 0x00);
    delayMicroseconds(200);
  }
  digitalWrite(pin,HIGH); SPI.endTransaction();
  PressureReading result{};
  result.raw=int16_t((uint16_t(data[0])<<8)|data[1]);
  memcpy(result.model,data+4,8); result.model[8]=0;
  result.valid=memcmp(data+4,"ND030D\0",7)==0;
  return result;
}

uint32_t readThermocouple(uint8_t pin) {
  SPI.beginTransaction(SPISettings(1000000,MSBFIRST,SPI_MODE0));
  digitalWrite(pin,LOW); delayMicroseconds(1);
  uint32_t frame=0;
  for(uint8_t i=0;i<4;i++) frame=(frame<<8)|SPI.transfer(0);
  digitalWrite(pin,HIGH); SPI.endTransaction();
  return frame;
}

bool readLoad(int32_t &raw) {
  // Only load 1 is enabled for this bring-up. Disconnected channels cannot hang.
  uint32_t started=millis();
  while(digitalRead(STRAIN_1_DATA)) {
    if(millis()-started>=500) return false;
    delay(1);
  }
  uint32_t bits=0;
  noInterrupts();
  for(uint8_t i=0;i<24;i++) {
    digitalWrite(STRAIN_1_SCK,HIGH); delayMicroseconds(1);
    bits=(bits<<1)|digitalRead(STRAIN_1_DATA);
    digitalWrite(STRAIN_1_SCK,LOW); delayMicroseconds(1);
  }
  // 25th pulse selects channel A, gain 128 for the next conversion.
  digitalWrite(STRAIN_1_SCK,HIGH); delayMicroseconds(1);
  digitalWrite(STRAIN_1_SCK,LOW);
  interrupts();
  raw=(bits&0x800000) ? int32_t(bits|0xFF000000) : int32_t(bits);
  return true;
}

void identity() {
  Serial.print("{\"protocol\":1,\"type\":\"identity\",\"firmware\":\"");
  Serial.print(VERSION);
  Serial.print("\",\"board\":\"");Serial.print(SENSORBOARD_NAME);
  Serial.println("\",\"pressure_model\":\"ND030D\",\"pressure_range_control\":true,\"pressure_filter_hz\":2,\"load_channels_enabled\":[1]}");
}

uint16_t ambientTransfer(uint16_t command) {
  SPI.beginTransaction(SPISettings(1000000,MSBFIRST,SPI_MODE1));
  digitalWrite(PRESS_ABS_CS,LOW);delayMicroseconds(1);
  uint16_t frame=SPI.transfer16(command);
  digitalWrite(PRESS_ABS_CS,HIGH);SPI.endTransaction();delay(10);
  return frame;
}

void ambientReading() {
  ambientTransfer(0xE000);
  uint16_t id=ambientTransfer(0xE000);
  ambientTransfer(0x2800);
  uint16_t frame=ambientTransfer(0xE000);
  uint16_t code=(frame>>1)&0x3FFF; // Figure 10: D14..D1=data, D15=diagnosis, D0=parity.
  const char* status=(id==0 || id==0xFFFF)?"no_response":
    (__builtin_parity(unsigned(frame))!=1)?"parity_error":
    (frame&0x8000)?"sensor_diagnosis":"ok";
  Serial.print(",\"ambient\":{\"identifier\":");Serial.print(id);
  Serial.print(",\"raw_frame\":");Serial.print(frame);
  Serial.print(",\"raw\":");Serial.print(code);
  Serial.print(",\"kpa\":");
  if(strcmp(status,"ok")) Serial.print("null");
  else {
#if BOARD_REVISION == 1
    // KP464 fitted in the Rev.1 schematic, datasheet table 14 (14-bit).
    Serial.print((float(code)+8737.6f)/218.44f,3);
#else
    Serial.print((float(code)+4756.0f)/105.70f,3);
#endif
  }
  Serial.print(",\"status\":\"");Serial.print(status);Serial.print("\"}");
}

void readings(bool pressureOnly=false) {
  Serial.print("{\"protocol\":1,\"type\":\"");
  Serial.print(pressureOnly ? "pressure_readings" : "readings");
  Serial.print("\",\"firmware\":\"");
  Serial.print(VERSION); Serial.print("\",\"timestamp_us\":"); Serial.print(micros());
  Serial.print(",\"pressure\":[");
  for(uint8_t i=0;i<4;i++) {
    if(i) Serial.print(',');
    PressureReading p=readPressure(pressurePins[i]);
    Serial.print("{\"channel\":");Serial.print(i+1);
    Serial.print(",\"range_psi\":");Serial.print(pressureRanges[i]);
    if(p.valid) {
      Serial.print(",\"model\":\"ND030D\",\"raw\":"); Serial.print(p.raw);
      Serial.print(",\"pa\":"); Serial.print(float(p.raw)/(32768.0f*0.9f)*pressureRanges[i]*6894.757293f,3);
      Serial.print(",\"status\":\"");
      Serial.print(abs(int(p.raw))>29491 ? "overrange" : "ok"); Serial.print('"');
    } else {
      Serial.print(",\"pa\":null,\"raw\":");Serial.print(p.raw);
      Serial.print(",\"model_hex\":\"");
      for(uint8_t j=0;j<8;j++){uint8_t b=uint8_t(p.model[j]);if(b<16)Serial.print('0');Serial.print(b,HEX);}
      Serial.print("\",\"status\":\"no_response_or_unsupported_model\"");
    }
    Serial.print('}');
  }
  if(pressureOnly) {Serial.println("]}");return;}
  Serial.print("],\"temperature\":[");
  for(uint8_t i=0;i<4;i++) {
    if(i) Serial.print(',');
    uint32_t frame=readThermocouple(temperaturePins[i]);
    Serial.print("{\"channel\":");Serial.print(i+1);
    Serial.print(",\"raw_frame\":");Serial.print(frame);
    int32_t cold=(frame>>4)&0xFFF;if(cold&0x800)cold-=0x1000;
    Serial.print(",\"cold_junction_celsius\":");Serial.print(cold*0.0625f,3);
    const char* fault=nullptr;
    if(frame==0 || frame==0xFFFFFFFF || (frame&0x00020008)) fault="no_response_or_invalid_frame";
    else if(frame&1) fault="open_thermocouple";
    else if(frame&2) fault="short_to_ground";
    else if(frame&4) fault="short_to_supply";
    else if(frame&0x10000) fault="converter_fault";
    Serial.print(",\"celsius\":");
    if(fault) Serial.print("null");
    else {
      int32_t code=frame>>18; if(code&0x2000) code-=0x4000;
      Serial.print(code*0.25f,2);
    }
    Serial.print(",\"status\":\"");Serial.print(fault ? fault : "ok"); Serial.print("\"}");
  }
  Serial.print("],\"strain\":[");
  int32_t raw=0; bool ready=readLoad(raw);
  Serial.print("{\"channel\":1,\"raw\":");
  if(ready) Serial.print(raw); else Serial.print("null");
  Serial.print(",\"status\":\"");
  Serial.print(!ready ? "adc_timeout" : (raw==8388607 || raw==-8388608) ? "adc_saturated" : "uncalibrated");
  Serial.print("\"},{\"channel\":2,\"raw\":null,\"status\":\"not_enabled\"},{\"channel\":3,\"raw\":null,\"status\":\"not_enabled\"},{\"channel\":4,\"raw\":null,\"status\":\"not_enabled\"}]");
  ambientReading();Serial.println('}');
}

void setup() {
  // Keep every unused SPI device deselected using the selected revision's map.
  for(uint8_t pin:pressurePins) {digitalWrite(pin,HIGH);pinMode(pin,OUTPUT);}
  for(uint8_t pin:temperaturePins) {digitalWrite(pin,HIGH);pinMode(pin,OUTPUT);}
  digitalWrite(PRESS_ABS_CS,HIGH);pinMode(PRESS_ABS_CS,OUTPUT);
  const uint8_t shiftPins[]={BACKPACK_1_SHIFTIN,BACKPACK_2_SHIFTIN,BACKPACK_3_SHIFTIN};
  const uint8_t clockPins[]={BACKPACK_1_CLK,BACKPACK_2_CLK,BACKPACK_3_CLK};
  for(uint8_t i=0;i<3;i++) {
    digitalWrite(shiftPins[i],HIGH);pinMode(shiftPins[i],OUTPUT);
    digitalWrite(clockPins[i],LOW);pinMode(clockPins[i],OUTPUT);
    for(uint8_t j=0;j<9;j++) {digitalWrite(clockPins[i],HIGH);delayMicroseconds(10);digitalWrite(clockPins[i],LOW);delayMicroseconds(10);}
  }
#if BOARD_REVISION == 1
  const uint8_t registerPins[]={BACKPACK_1_REGCLK,BACKPACK_2_REGCLK,BACKPACK_3_REGCLK};
  for(uint8_t pin:registerPins) {
    digitalWrite(pin,LOW);pinMode(pin,OUTPUT);
    digitalWrite(pin,HIGH);delayMicroseconds(10);digitalWrite(pin,LOW);
  }
  pinMode(CORE_LED_RED,OUTPUT);digitalWrite(CORE_LED_RED,LOW);
#else
  const uint8_t leds[]={TEMP_LED_ENABLE,TEMP_LED_MEASURE,PRESS_LED_ENABLE,PRESS_LED_MEASURE,STRAIN_LED_ENABLE,STRAIN_LED_MEASURE,BACKPACK_1_LED_ENABLE,BACKPACK_2_LED_ENABLE,BACKPACK_3_LED_ENABLE,CORE_LED_YELLOW,CORE_LED_RED,CORE_LED_GREEN};
  for(uint8_t pin:leds) {digitalWrite(pin,LOW);pinMode(pin,OUTPUT);}
#endif
  const uint8_t loadClocks[]={STRAIN_1_SCK,STRAIN_2_SCK,STRAIN_3_SCK,STRAIN_4_SCK};
  for(uint8_t pin:loadClocks) {digitalWrite(pin,HIGH);pinMode(pin,OUTPUT);}
  pinMode(STRAIN_1_DATA,INPUT_PULLUP);delayMicroseconds(100);digitalWrite(STRAIN_1_SCK,LOW);
  SPI.setRX(SPI_MISO);SPI.setTX(SPI_MOSI);SPI.setSCK(SPI_SCK);SPI.begin();
  Serial.begin(115200);
  delay(100);
  // Initialize the shared SPI peripherals once, without publishing readings.
  // On this board, pressure-only startup returned zero frames until the first
  // complete legacy read sequence had accessed the other SPI peripherals.
  for(uint8_t pin:temperaturePins) readThermocouple(pin);
  ambientTransfer(0xE000);ambientTransfer(0xE000);
  ambientTransfer(0x2800);ambientTransfer(0xE000);
  // Write mode twice, then discard settling readings before USB requests.
  for(uint8_t n=0;n<2;n++) for(uint8_t pin:pressurePins) readPressure(pin);
  delay(1500);
}

void loop() {
  digitalWrite(CORE_LED_RED,(millis()%2000)<25);
  while(Serial.available()) {
    char c=Serial.read();lastByteMs=millis();
    if(c=='\r') continue;
    if(c=='\n') {
      commandBuffer[commandLength]=0;
      if(overflowed) Serial.println("{\"protocol\":1,\"type\":\"error\",\"error\":\"command_too_long\"}");
      else if(!strcmp(commandBuffer,"identify") || !strcmp(commandBuffer,"status")) identity();
      else if(!strcmp(commandBuffer,"read")) readings();
      else if(!strcmp(commandBuffer,"pressure")) readings(true);
      else if(!strncmp(commandBuffer,"range ",6)) {
        unsigned channel=0,range=0;char extra=0;
        if(sscanf(commandBuffer,"range %u %u %c",&channel,&range,&extra)==2 && channel>=1 && channel<=3 && (range==5 || range==10 || range==30)) {
          pressureRanges[channel-1]=range;
          // Discard both transfers affected by the mode register's one-cycle latency.
          readPressure(pressurePins[channel-1]);readPressure(pressurePins[channel-1]);delay(1500);
          Serial.print("{\"protocol\":1,\"type\":\"configuration\",\"channel\":");Serial.print(channel);
          Serial.print(",\"range_psi\":");Serial.print(range);Serial.println('}');
        } else Serial.println("{\"protocol\":1,\"type\":\"error\",\"error\":\"invalid_range\"}");
      }
      else if(commandLength) Serial.println("{\"protocol\":1,\"type\":\"error\",\"error\":\"unknown_command\"}");
      commandLength=0;overflowed=false;
    } else if(commandLength<sizeof(commandBuffer)-1 && !overflowed) commandBuffer[commandLength++]=c;
    else overflowed=true;
  }
  if((commandLength || overflowed) && millis()-lastByteMs>2000) {
    commandLength=0;overflowed=false;
    Serial.println("{\"protocol\":1,\"type\":\"error\",\"error\":\"command_timeout\"}");
  }
}
