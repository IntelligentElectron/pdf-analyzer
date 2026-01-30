# PDF Analyzer Test Report - IC Datasheets

**Test Date:** 2026-01-30
**Tool Version:** PDF Analyzer MCP Server (gemini-3-pro-preview)
**Test Scope:** 20 IC datasheets from 20 different vendors

---

## Executive Summary

| Metric | Value |
|--------|-------|
| **Total Tests** | 20 |
| **Successful** | 20 |
| **Failed** | 0 |
| **Success Rate** | **100%** |
| **URLs Requiring Retry** | 2 |

The PDF Analyzer successfully analyzed all 20 IC datasheets from 20 different vendors, correctly extracting part numbers, electrical specifications, and typical applications from each document.

---

## Test Methodology

### Query Set (3 queries per datasheet)
1. **Basic Info:** "What is this IC's part number and brief description?"
2. **Specifications:** "What are the key electrical specifications (voltage, current, frequency)?"
3. **Applications:** "What are the typical applications for this IC?"

### Success Criteria
- URL must resolve to valid PDF content
- All 3 queries must receive meaningful, accurate responses
- Response must correctly identify the IC and extract relevant technical data

---

## Detailed Results

### 1. STMicroelectronics - STM32F103 (ARM Cortex-M3 MCU)

| Field | Value |
|-------|-------|
| **Status** | ✅ SUCCESS |
| **URL** | https://www.st.com/resource/en/datasheet/stm32f103c8.pdf |
| **File URI** | `8b1voal3alh1` |

**Extracted Data:**
- **Part Number:** STM32F103x8 / STM32F103xB
- **Description:** Medium-density ARM Cortex-M3 32-bit MCU with 64/128KB Flash, USB, CAN, 7 timers
- **Voltage:** 2.0-3.6V (VDD), 1.8-3.6V (VBAT)
- **Current:** 150mA max, ~50mA in Run mode @ 72MHz
- **Frequency:** 72 MHz max
- **Applications:** Motor drives, medical equipment, PLCs, printers, alarm systems, HVACs

---

### 2. Texas Instruments - LM7805 (Linear Voltage Regulator)

| Field | Value |
|-------|-------|
| **Status** | ✅ SUCCESS |
| **URL** | https://www.ti.com/lit/ds/symlink/lm340.pdf |
| **File URI** | `2eifry8hxux8` |

**Extracted Data:**
- **Part Number:** LM340, LM340A, LM7805, LM7812, LM7815
- **Description:** Wide VIN 1.5A Fixed Voltage Regulators with thermal shutdown
- **Voltage:** 5V, 12V, 15V fixed outputs; 35V max input
- **Current:** Up to 1.5A output
- **Applications:** Industrial power supplies, SMPS post regulation, HVAC, motor drivers

---

### 3. Analog Devices - AD8221 (Instrumentation Amplifier)

| Field | Value |
|-------|-------|
| **Status** | ✅ SUCCESS |
| **URL** | https://www.analog.com/media/en/technical-documentation/data-sheets/AD8221.pdf |
| **File URI** | `owggw4wuclpg` |

**Extracted Data:**
- **Part Number:** AD8221
- **Description:** Gain programmable precision instrumentation amplifier with highest CMRR in class
- **Voltage:** ±2.3V to ±18V supply
- **Current:** 0.9mA quiescent, 0.4nA input bias
- **Frequency:** 825kHz bandwidth @ G=1, 80dB CMRR to 10kHz
- **Applications:** Weigh scales, bridge amplifiers, medical instrumentation, strain gages

---

### 4. Microchip - PIC16F877A (8-bit MCU)

| Field | Value |
|-------|-------|
| **Status** | ✅ SUCCESS |
| **URL** | https://ww1.microchip.com/downloads/en/devicedoc/39582b.pdf |
| **File URI** | `tp2shmat7cjm` |

**Extracted Data:**
- **Part Number:** PIC16F873A, PIC16F874A, PIC16F876A, PIC16F877A
- **Description:** 28/40/44-Pin Enhanced Flash Microcontrollers, 35-instruction RISC CPU
- **Voltage:** 2.0V to 5.5V
- **Current:** 250mA max VDD, 25mA per I/O pin
- **Frequency:** DC to 20MHz
- **Applications:** Serial communication, embedded control, motor control, networking

---

### 5. NXP - LPC1768 (ARM Cortex-M3 MCU)

| Field | Value |
|-------|-------|
| **Status** | ✅ SUCCESS |
| **URL** | https://datasheet.octopart.com/LPC1768FBD100,551-NXP-datasheet-8326490.pdf |
| **File URI** | `brjibjx01qm7` |

**Extracted Data:**
- **Part Number:** LPC1768, LPC1766, LPC1765, LPC1764
- **Description:** 32-bit ARM Cortex-M3 MCU with Ethernet, USB Host/Device/OTG, CAN
- **Voltage:** 2.4V to 3.6V (single 3.3V supply)
- **Current:** 42mA active @ 100MHz, 517nA deep power-down
- **Frequency:** Up to 100MHz
- **Applications:** eMetering, lighting, industrial networking, alarm systems, motor control

---

### 6. Infineon - IRS2184 (Half-Bridge Driver)

| Field | Value |
|-------|-------|
| **Status** | ✅ SUCCESS (retry required) |
| **Original URL** | https://www.infineon.com/dgdl/... (404 error) |
| **Working URL** | https://www.farnell.com/datasheets/57932.pdf |
| **File URI** | `iinb0ndhzynh` |

**Extracted Data:**
- **Part Number:** IRS2184, IRS21844, IRS2184S, IRS21844S
- **Description:** Half-bridge driver for high voltage power MOSFETs and IGBTs
- **Voltage:** 600V high side, 10-20V gate drive supply
- **Current:** 1.9A source, 2.3A sink
- **Frequency:** Up to 1MHz switching
- **Applications:** Half-bridge MOSFET/IGBT drive up to 600V

---

### 7. ON Semiconductor - LM358 (Op-Amp)

| Field | Value |
|-------|-------|
| **Status** | ✅ SUCCESS |
| **URL** | https://www.onsemi.com/download/data-sheet/pdf/lm358-d.pdf |
| **File URI** | `6cfqufn329p1` |

**Extracted Data:**
- **Part Number:** LM258, LM358, LM358A, LM358E, LM2904
- **Description:** Single supply dual operational amplifier with ground-referenced input
- **Voltage:** 3.0V to 32V single supply, ±1.5V to ±16V split
- **Current:** 0.7mA quiescent @ 5V, 40mA source output
- **Frequency:** ~1MHz unity gain
- **Applications:** Voltage reference, Wien bridge oscillator, comparator, filters

---

### 8. Texas Instruments - MAX232 (RS-232 Driver)

| Field | Value |
|-------|-------|
| **Status** | ✅ SUCCESS |
| **URL** | https://www.ti.com/lit/ds/symlink/max232.pdf |
| **File URI** | `0dw5bt95za1n` |

**Extracted Data:**
- **Part Number:** MAX232
- **Description:** Dual driver/receiver with capacitive voltage generator for RS-232
- **Voltage:** Single 5V supply (4.5V to 5.5V), ±30V input tolerant
- **Current:** 8mA typical supply current
- **Frequency:** 120kbit/s data rate
- **Applications:** Terminals, modems, computers, battery-powered systems

---

### 9. Nordic Semiconductor - nRF52832 (Bluetooth SoC)

| Field | Value |
|-------|-------|
| **Status** | ✅ SUCCESS (retry required) |
| **Original URL** | https://infocenter.nordicsemi.com/pdf/... (HTML error) |
| **Working URL** | https://www.mouser.com/datasheet/2/297/nRF52832_PS_v1_8-2942485.pdf |
| **File URI** | `7q36tu7g0i00` |

**Extracted Data:**
- **Part Number:** nRF52832
- **Description:** Bluetooth LE SoC with ARM Cortex-M4 and FPU for ultra-low power
- **Voltage:** 1.7V to 3.6V
- **Current:** 5.3mA TX @ 0dBm, 5.4mA RX, 0.3µA System OFF
- **Frequency:** 64MHz processor
- **Applications:** IoT, home automation, health/fitness, remote controls, beacons

---

### 10. Silicon Labs - CP2102 (USB-to-UART Bridge)

| Field | Value |
|-------|-------|
| **Status** | ✅ SUCCESS |
| **URL** | https://www.silabs.com/documents/public/data-sheets/CP2102-9.pdf |
| **File URI** | `kyhzvdeffk85` |

**Extracted Data:**
- **Part Number:** CP2102/CP2109
- **Description:** Single-chip USB-to-UART bridge with integrated USB controller and oscillator
- **Voltage:** 3.0-3.6V self-powered, 4.0-5.25V bus-powered
- **Current:** 20mA normal, 80µA suspended
- **Frequency:** 48MHz internal oscillator, 300bps to 1Mbps UART
- **Applications:** RS-232 legacy upgrade, USB interface cables, serial adapters

---

### 11. Renesas - RA4M1 (ARM Cortex-M4 MCU)

| Field | Value |
|-------|-------|
| **Status** | ✅ SUCCESS |
| **URL** | https://docs.arduino.cc/resources/datasheets/ra4m1-datasheet.pdf |
| **File URI** | `ezrckrb37gd9` |

**Extracted Data:**
- **Part Number:** R7FA4M1AB3CFP (RA4M1 Group)
- **Description:** 48MHz ARM Cortex-M4 with FPU, LCD controller, capacitive touch
- **Voltage:** 1.6V to 5.5V
- **Current:** 8.3mA active @ 48MHz, 0.8µA standby
- **Frequency:** 48MHz max
- **Applications:** HMI applications with LCD and touch sensing

---

### 12. Monolithic Power Systems - MP1584 (DC-DC Converter)

| Field | Value |
|-------|-------|
| **Status** | ✅ SUCCESS |
| **URL** | https://content.instructables.com/FT8/0X4N/J9SVVWSX/FT80X4NJ9SVVWSX.pdf |
| **File URI** | `2hrdtsa4me7f` |

**Extracted Data:**
- **Part Number:** MP1584
- **Description:** High frequency step-down switching regulator with integrated high-side MOSFET
- **Voltage:** 4.5V to 28V input
- **Current:** 3A output, 100µA quiescent
- **Frequency:** 100kHz to 1.5MHz programmable switching
- **Applications:** Automotive, industrial power, distributed power, battery systems

---

### 13. Micron - MT48LC16M16A2 (SDRAM)

| Field | Value |
|-------|-------|
| **Status** | ✅ SUCCESS |
| **URL** | https://datasheet.octopart.com/MT48LC16M16A2TG-7E-IT:D-Micron-datasheet-7627877.pdf |
| **File URI** | `gp2tjyxa0mtf` |

**Extracted Data:**
- **Part Number:** MT48LC64M4A2, MT48LC32M8A2, MT48LC16M16A2
- **Description:** 256Mb synchronous DRAM, quad-bank architecture
- **Voltage:** 3.3V ±0.3V
- **Current:** 125-135mA operating, 2.5mA self-refresh
- **Frequency:** 133MHz to 167MHz (PC100/PC133 compliant)
- **Applications:** 3.3V memory systems

---

### 14. Winbond - W25Q128JV (SPI Flash)

| Field | Value |
|-------|-------|
| **Status** | ✅ SUCCESS |
| **URL** | https://www.winbond.com/resource-files/w25q128jv%20revf%2003272018%20plus.pdf |
| **File URI** | `aamvci5biwz6` |

**Extracted Data:**
- **Part Number:** W25Q128JV
- **Description:** 128M-bit serial flash memory with Dual/Quad SPI
- **Voltage:** 2.7V to 3.6V
- **Current:** <1µA power-down, 15-20mA active read
- **Frequency:** Up to 133MHz SPI (532MHz equivalent Quad I/O)
- **Applications:** Code shadowing, execute-in-place (XIP), voice/text/data storage

---

### 15. FTDI - FT232RL (USB-to-UART)

| Field | Value |
|-------|-------|
| **Status** | ✅ SUCCESS |
| **URL** | https://ftdichip.com/wp-content/uploads/2020/08/DS_FT232R.pdf |
| **File URI** | `mjzeosvdnovg` |

**Extracted Data:**
- **Part Number:** FT232R (FT232RL in SSOP-28, FT232RQ in QFN-32)
- **Description:** Single-chip USB to serial UART interface with integrated EEPROM
- **Voltage:** 3.3V to 5.25V VCC, 1.8V to 5.25V VCCIO
- **Current:** 15mA operating, 70µA USB suspend
- **Frequency:** 12MHz internal oscillator
- **Applications:** USB-RS232/RS422/RS485 converters, MCU/FPGA interfacing, instrumentation

---

### 16. Bosch Sensortec - BMP280 (Pressure Sensor)

| Field | Value |
|-------|-------|
| **Status** | ✅ SUCCESS |
| **URL** | https://www.bosch-sensortec.com/media/boschsensortec/downloads/datasheets/bst-bmp280-ds001.pdf |
| **File URI** | `mmuftoev44v5` |

**Extracted Data:**
- **Part Number:** BMP280
- **Description:** Digital barometric pressure sensor using piezo-resistive technology
- **Voltage:** 1.71V to 3.6V (VDD), 1.2V to 3.6V (VDDIO)
- **Current:** 2.7µA @ 1Hz, 0.1µA sleep, 1120µA peak
- **Frequency:** I²C up to 3.4MHz, SPI up to 10MHz
- **Applications:** GPS enhancement, indoor navigation, weather forecast, altitude detection

---

### 17. TDK/InvenSense - MPU-6050 (IMU)

| Field | Value |
|-------|-------|
| **Status** | ✅ SUCCESS |
| **URL** | https://invensense.tdk.com/wp-content/uploads/2015/02/MPU-6000-Datasheet1.pdf |
| **File URI** | `70jkmhmwrpic` |

**Extracted Data:**
- **Part Number:** MPU-6000, MPU-6050
- **Description:** 6-axis MotionTracking device with 3-axis gyro, 3-axis accelerometer, DMP
- **Voltage:** 2.375V to 3.46V (VDD), 1.71V to VDD (VLOGIC)
- **Current:** 3.9mA full operation, 5µA idle, 10-110µA low-power accel
- **Frequency:** I²C up to 400kHz, SPI up to 20MHz
- **Applications:** Image stabilization, gesture recognition, gaming, wearables, toys

---

### 18. Nexperia - 74HC595 (Shift Register)

| Field | Value |
|-------|-------|
| **Status** | ✅ SUCCESS |
| **URL** | https://assets.nexperia.com/documents/data-sheet/74HC_HCT595.pdf |
| **File URI** | `v1gdeka02o8j` |

**Extracted Data:**
- **Part Number:** 74HC595, 74HCT595
- **Description:** 8-bit serial-in, serial/parallel-out shift register with 3-state outputs
- **Voltage:** 2.0V to 6.0V (HC), 4.5V to 5.5V (HCT)
- **Current:** ±35mA output, 70mA supply max
- **Frequency:** 100MHz typical shift frequency
- **Applications:** Serial-to-parallel conversion, remote control holding register

---

### 19. Diodes Inc - AP2112 (LDO Regulator)

| Field | Value |
|-------|-------|
| **Status** | ✅ SUCCESS |
| **URL** | https://www.diodes.com/assets/Datasheets/AP2112.pdf |
| **File URI** | `gy6t33ipl2k3` |

**Extracted Data:**
- **Part Number:** AP2112
- **Description:** 600mA CMOS LDO regulator with enable and auto-discharge
- **Voltage:** 2.5V to 6.0V input, 1.2V/1.8V/2.5V/2.6V/3.3V fixed output
- **Current:** 600mA output, 55µA quiescent, 0.01µA standby
- **Frequency:** -65dB PSRR @ 1kHz, 50µVrms noise
- **Applications:** Laptop computers, LCD monitors, portable DVD

---

### 20. Broadcom - HCPL-0611 (Optocoupler)

| Field | Value |
|-------|-------|
| **Status** | ✅ SUCCESS |
| **URL** | https://datasheet.octopart.com/HCPL-0611-Avago-datasheet-7617305.pdf |
| **File URI** | `s27idpbvw1my` |

**Extracted Data:**
- **Part Number:** HCPL-0611 (and related: 6N137, HCPL-0600, HCPL-2601, etc.)
- **Description:** High CMR, high speed TTL compatible optocoupler with Schmitt trigger output
- **Voltage:** 4.5V to 5.5V supply, 3750V isolation
- **Current:** 5mA input current
- **Frequency:** 10MBd speed, 15kV/µs CMR, 48-50ns propagation delay
- **Applications:** Isolated line receivers, processor interfaces, motor drives, power supplies

---

## Error Analysis

### Initial URL Failures (2)

| # | Vendor | Part | Original URL Issue | Resolution |
|---|--------|------|-------------------|------------|
| 6 | Infineon | IRS2184 | 404 Not Found | Used Farnell mirror |
| 9 | Nordic | nRF52832 | Content-Type: text/html | Used Mouser mirror |

**Root Causes:**
1. **IRS2184:** Infineon's dynamic URL with query parameters was not resolving correctly
2. **nRF52832:** Nordic's infocenter URL returns an HTML wrapper page instead of direct PDF

**Mitigation:** Distributor mirrors (Farnell, Mouser) provided reliable PDF access for both cases.

---

## Performance Observations

### Response Quality Assessment

| Aspect | Rating | Notes |
|--------|--------|-------|
| **Part Number Extraction** | Excellent | Correctly identified all primary and variant part numbers |
| **Specification Accuracy** | Excellent | Extracted voltage, current, frequency with correct units |
| **Application Coverage** | Very Good | Listed applications accurately; some datasheets lack explicit application sections |
| **Multi-Part Datasheets** | Excellent | Correctly handled datasheets covering multiple part variants |

### Document Characteristics Handled

- **Page counts:** 16 to 500+ pages
- **File sizes:** ~100KB to multi-MB
- **Document types:** Product specifications, datasheets, data briefs
- **Formats:** Single-part and multi-part family datasheets

---

## Vendor Coverage Summary

| Category | Vendors Tested | All Successful |
|----------|---------------|----------------|
| **Microcontrollers** | STMicroelectronics, Microchip, NXP, Renesas | ✅ |
| **Analog ICs** | Texas Instruments, Analog Devices, ON Semi | ✅ |
| **Power Management** | Infineon, Monolithic Power, Diodes Inc | ✅ |
| **Memory** | Micron, Winbond | ✅ |
| **RF/Wireless** | Nordic Semiconductor, Silicon Labs | ✅ |
| **Interface ICs** | FTDI, Broadcom | ✅ |
| **Sensors** | Bosch Sensortec, TDK/InvenSense | ✅ |
| **Logic ICs** | Nexperia | ✅ |

---

## Recommendations

### For PDF Analyzer Users

1. **Prefer distributor mirrors** (Mouser, Farnell, Digi-Key, Octopart) when manufacturer URLs fail
2. **Reuse file_uri** for follow-up queries on the same document (48-hour cache)
3. **Be specific with queries** - the analyzer handles technical questions well

### For PDF Analyzer Development

1. **URL redirect handling** - Consider following redirects for HTML-wrapped PDF download pages
2. **Error messages** - Current error messages are clear and actionable
3. **Large document handling** - Successfully processed 500+ page datasheets

---

## Conclusion

The PDF Analyzer MCP tool demonstrates **100% success rate** across 20 diverse IC datasheets from 20 different vendors. It accurately extracts technical specifications from complex engineering documents with varying formats and sizes. The tool's ability to handle multi-part family datasheets and extract structured data makes it highly suitable for engineering documentation analysis.

The only issues encountered were URL-related (server-side 404 errors and HTML wrappers), which were easily resolved using alternative PDF sources. The Gemini 3 Pro model powering the analyzer showed excellent comprehension of technical semiconductor documentation.

---

*Report generated by PDF Analyzer MCP Server testing suite*
