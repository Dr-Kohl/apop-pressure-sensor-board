#pragma once
#if defined(PICO_RP2350) && PICO_RP2350
#define BOARD_REVISION 2
#define SENSORBOARD_NAME "sensorboard-rp2350b-rev2"
#include "PinsRev2.h"
#elif defined(PICO_RP2040) && PICO_RP2040
#define BOARD_REVISION 1
#define SENSORBOARD_NAME "sensorboard-rp2040-rev1"
#include "PinsRev1.h"
#else
#error Select an RP2040 or RP2350 build target
#endif
