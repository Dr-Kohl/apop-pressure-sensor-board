#pragma once

/* --- Pin definitions --- */
// For RP2350B (Rev. 2)
// LEDs are high-active unless otherwise noted

#define EMPTY_PIN               0

// MAX31855 pins
#define TEMP_1_CS               6
#define TEMP_2_CS               5
#define TEMP_3_CS               4
#define TEMP_4_CS               3

#define TEMP_LED_ENABLE         2 // Yellow
#define TEMP_LED_MEASURE        1 // Green

// HV120 pressure pins
#define PRESS_1_CS              8
#define PRESS_2_CS              9
#define PRESS_3_CS              10
#define PRESS_4_CS              11

#define PRESS_LED_ENABLE        12 // Yellow
#define PRESS_LED_MEASURE       13 // Green

// Absolute pressure chip-select
#define PRESS_ABS_CS            17

// DAC53401 I2C pins
#define DAC_SDA                 14
#define DAC_SCL                 27

// SPI bus
#define SPI_MISO                20
#define SPI_MOSI                19
#define SPI_SCK                 18

// HX711 pins
#define STRAIN_1_DATA           21 // Read only
#define STRAIN_1_SCK            22
#define STRAIN_1_SEL            23 // Read only

#define STRAIN_2_DATA           24 // Read only
#define STRAIN_2_SCK            25
#define STRAIN_2_SEL            26 // Read only

#define STRAIN_3_DATA           28 // Read only
#define STRAIN_3_SCK            29
#define STRAIN_3_SEL            30 // Read only

#define STRAIN_4_DATA           31 // Read only
#define STRAIN_4_SCK            32
#define STRAIN_4_SEL            33 // Read only

#define STRAIN_LED_ENABLE       34 // Yellow
#define STRAIN_LED_MEASURE      35 // Green

// General-purpose LEDs
#define CORE_LED_YELLOW         36
#define CORE_LED_RED            37
#define CORE_LED_GREEN          38

// Backpack pins
#define BACKPACK_1_SHIFTIN      45
#define BACKPACK_1_CLK          46
#define BACKPACK_1_LED_ENABLE   47 // Yellow

#define BACKPACK_2_SHIFTIN      42
#define BACKPACK_2_CLK          43
#define BACKPACK_2_LED_ENABLE   44 // Yellow

#define BACKPACK_3_SHIFTIN      39
#define BACKPACK_3_CLK          40
#define BACKPACK_3_LED_ENABLE   41 // Yellow
