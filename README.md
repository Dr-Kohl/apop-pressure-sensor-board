# APOP Pressure Sensor Board

A browser dashboard for three ND030D differential pressure channels on the APOP sensor board.

**[Open the dashboard](https://dr-kohl.github.io/apop-pressure-sensor-board/)**

## Connect and measure

1. Open the dashboard in desktop Chrome or Edge. The computer must have the sensor board connected by USB.
2. Close other serial monitors and disconnect other dashboard tabs using the board.
3. Click **Connect board** and select the board's serial port. Port numbers vary between computers.
4. Select each channel's **±5, ±10 or ±30 PSI** range. Choose **PSI** or **Pa** for display units.
5. Readings and the shared scrolling graph start automatically. **Show** hides only a channel's graph line; that channel remains in recordings.

The dashboard requires firmware **usb-0.4.0** supplied in this repository. The tested hardware is the **RP2040 Rev.1 board**, with three ND030D sensors. This firmware is board-specific, not a generic driver for every pressure board. The alternate RP2350/Rev.2 pin map is included but has not been validated on hardware.

The target acquisition rate is **10 samples per second**. Each sensor uses its **2 Hz low-pass filter** and **50/60 Hz notch filter**. Large numerical readings refresh once per second. The graph retains the latest 60 seconds; a recording retains every received sample between Start and Stop. This browser-based acquisition is not hard real time. Keep the tab active: background throttling, USB delays and computer load can change actual intervals. Use CSV timestamps to check timing.

## Zero a channel

ND030D reports pressure at **B minus A**. For a positive-pressure test, connect tubing to B and leave A open. Keep saliva and condensation out of the sensor.

Before zeroing, equalize the pressure at both ports: leave A and B open to room air with no airflow, or connect both ports to the same pressure source. Click that channel's **Zero** and keep pressure steady for five seconds. The mean of the accepted readings becomes the displayed offset and is subtracted from future readings. **Reset zero** removes the correction.

The page rejects invalid, interrupted or unstable zeroing attempts and retains any previous offset. Zeroing cannot distinguish a steady real pressure difference from sensor offset; equalizing the ports is essential. This corrects baseline offset, not sensor sensitivity. Absolute measurement accuracy still needs checking against an independent pressure reference.

Range changes clear the affected channel's zero. Disconnecting/reconnecting clears all zeros. Zero and range changes are locked while recording. Past graph points retain their original correction and the trace breaks where corrections change.

The five-second zero window requires at least 45 valid samples spanning 4.5 seconds, with no interval over 300 ms. Initial stability limits at ±5 PSI are 40 Pa peak-to-peak, 12 Pa standard deviation, and 15 Pa change between the first and last one-second means. Limits scale with range. These are initial bench-informed tolerances; evaluate them for your setup.

## Record and save CSV

Click **Start recording**, perform the measurement, then click **Stop recording**. **Save CSV…** opens a Save As dialog in supported Chrome/Edge browsers, where you can choose the filename and folder. Cancelling or a failed write preserves the recording. Other browsers fall back to their normal download behavior.

A new recording replaces the previous one. The page warns before replacing unsaved data and before closing with unsaved data. Save before refreshing. Readings are held in tab memory only: the application does not upload measurements or store them on a server or in browser storage. The public site connects to the visitor's local board, not a remote board.

CSV includes local computer date/time without a time zone, monotonic elapsed seconds, sensor-filter bandwidth, target sample rate, and columns for sensors detected when recording starts. Each detected channel includes:

- Corrected pressure in the recording's selected units.
- Sensor status and selected range in PSI.
- Applied zero offset in the same units as corrected pressure.

**Measured pressure = corrected pressure + zero offset.** Units and offsets are frozen when recording starts, even if display units change. Hidden channels remain included. Invalid or overrange pressure values are blank with an explicit status. Timestamps represent computer receipt time; the three channels are read sequentially, not simultaneously.

## Firmware build and upload

Use Arduino CLI with the **Raspberry Pi Pico/RP2040** core by Earle F. Philhower. The tested build used Arduino CLI 1.3.1 and core 5.6.0. Install the core through Arduino Boards Manager or the CLI before building. The script below uses the RP2040 generic target with 16 MB flash and the boot stage required by the tested board. Review the pin maps and target before using another board.

From PowerShell in this repository:

```powershell
./tools/Build-Rev1.ps1
./tools/Build-Rev1.ps1 -Upload -Port COM44
```

Replace COM44 with the actual port on your computer and disconnect the dashboard before upload. The script finds `arduino-cli` on PATH or the standard Windows Arduino IDE installation. You may pass `-CliPath` explicitly.

The standalone sketch is `firmware/SensorBoardUsb`. No motor, DAC or VFD commands are sent. The existing temperature, ambient and load inputs remain available through the firmware's general `read` command; the dashboard requests only `pressure`.

### Pressure protocol

USB serial uses newline-delimited commands and protocol-1 JSON replies (115200 nominal baud).

| Command | Reply |
| --- | --- |
| `identify` | Firmware, board and pressure-filter metadata |
| `pressure` | Pressure readings, status and per-channel ranges |
| `range 1 10` | Set channel 1 to ±10 PSI; acknowledge after settling |

Range commands accept channels 1–3 and ranges 5, 10 or 30. The 2 Hz filter/notch mode bytes are 0x90, 0x92 and 0x96 respectively. Rate byte 0x01 sets DAV notifications to 444 Hz; the browser does not use the DAV pin. Range changes discard two transfer responses and wait 1.5 seconds for settling. Startup initializes the shared SPI peripherals once before pressure-only sampling.

See the [manufacturer's ND Series datasheet, DS-0006B](https://www.mouser.lt/datasheet/3/2639/1/DS-0006B.ND-Differential-Middle-Pressure.pdf), especially sections 10.6 and 10.7.

## Local development and tests

No frontend build or package installation is required. From the repository root:

```powershell
python -m http.server 8765 --bind 127.0.0.1 --directory docs
```

Open `http://127.0.0.1:8765/` in desktop Chrome or Edge. USB serial requires a secure context such as HTTPS or localhost.

Run the tests with a recent Node.js version (tested on Node 24):

```powershell
node --test tests/apop-data.test.mjs tests/apop-workflow.test.mjs
```

Tests cover CSV formatting, units, zero stability/rejection, offset preservation, range changes, recording controls, save-dialog success/cancellation/failure, and disconnect handling. The workflow test simulates the DOM and board; it is not a substitute for browser/hardware verification.

## Publishing updates

GitHub Pages serves `/docs` from `main`. Changes pushed to that branch publish the dashboard. Keep asset-version query strings in step when changing modules so existing browsers fetch matching files. Firmware changes require uploading the sketch to each board separately; publishing the website does not flash connected boards.

## License

MIT. See [LICENSE](LICENSE). You may reuse and modify the code under those terms.
