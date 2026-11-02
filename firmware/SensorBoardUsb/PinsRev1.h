#pragma once
// Verified from SCH_WindTunnel_2026-11-02.json, main board RP2040 U3.
// All values are GPIO numbers, not QFN package pin numbers.
#define TEMP_1_CS 12
#define TEMP_2_CS 11
#define TEMP_3_CS 10
#define TEMP_4_CS 9
// Number by physical Press 1..4 positions P3..P6 in the Rev.1 board layout.
// The schematic's HV120_1_CS label is on P6, not physical Press 1.
#define PRESS_1_CS 13
#define PRESS_2_CS 14
#define PRESS_3_CS 15
#define PRESS_4_CS 17
#define PRESS_ABS_CS 20
#define SPI_MISO 16
#define SPI_MOSI 19
#define SPI_SCK 18
#define STRAIN_1_DATA 21
#define STRAIN_1_SCK 22
#define STRAIN_2_DATA 23
#define STRAIN_2_SCK 24
#define STRAIN_3_DATA 25
#define STRAIN_3_SCK 26
#define STRAIN_4_DATA 27
#define STRAIN_4_SCK 28
#define CORE_LED_RED 29
#define BACKPACK_1_SHIFTIN 0
#define BACKPACK_1_REGCLK 1
#define BACKPACK_1_CLK 2
#define BACKPACK_2_SHIFTIN 3
#define BACKPACK_2_REGCLK 4
#define BACKPACK_2_CLK 5
#define BACKPACK_3_SHIFTIN 6
#define BACKPACK_3_REGCLK 7
#define BACKPACK_3_CLK 8
