#Requires AutoHotkey v2.0
#SingleInstance Force

CoordMode("Mouse", "Screen")
CoordMode("Pixel", "Screen")

global isEnabled := false
global isCapturing := false
global isCompact := true
global click1Set := false
global click2Set := false
global click3Set := false
global click4Set := false
global click5Set := false
global click1X := 0
global click1Y := 0
global click2X := 0
global click2Y := 0
global click3X := 0
global click3Y := 0
global click4X := 0
global click4Y := 0
global click5X := 0
global click5Y := 0

mainGui := Gui(, "Click & Paste Macro")
mainGui.BackColor := "F4F6F8"
mainGui.SetFont("s10", "Segoe UI")
mainGui.MarginX := 20
mainGui.MarginY := 18

mainGui.SetFont("s16 w600", "Segoe UI")
titleText := mainGui.AddText("xm w380 Center c20252B", "Click & Paste")
mainGui.SetFont("s9 norm", "Segoe UI")
helpText := mainGui.AddText("xm y+4 w380 Center c66717D", "Press ' for Flow 1, / for Flow 2")

mainGui.SetFont("s10 w600", "Segoe UI")
click1Header := mainGui.AddText("xm y+20 c20252B", "Click 1")
mainGui.SetFont("s9 norm", "Segoe UI")
click1Label := mainGui.AddText("xm y+5 w230 h28 +0x200 BackgroundFFFFFF c66717D", "  Not set")
setClick1Button := mainGui.AddButton("x+10 yp w140 h28", "Coordinates Checker 1")
setClick1Button.OnEvent("Click", CaptureClick1)

mainGui.SetFont("s10 w600", "Segoe UI")
click2Header := mainGui.AddText("xm y+16 c20252B", "Click 2")
mainGui.SetFont("s9 norm", "Segoe UI")
click2Label := mainGui.AddText("xm y+5 w230 h28 +0x200 BackgroundFFFFFF c66717D", "  Not set")
setClick2Button := mainGui.AddButton("x+10 yp w140 h28", "Coordinates Checker 2")
setClick2Button.OnEvent("Click", CaptureClick2)

mainGui.SetFont("s10 w600", "Segoe UI")
click3Header := mainGui.AddText("xm y+16 c20252B", "Click 3")
mainGui.SetFont("s9 norm", "Segoe UI")
click3Label := mainGui.AddText("xm y+5 w230 h28 +0x200 BackgroundFFFFFF c66717D", "  Not set")
setClick3Button := mainGui.AddButton("x+10 yp w140 h28", "Coordinates Checker 3")
setClick3Button.OnEvent("Click", CaptureClick3)
click3Button := mainGui.AddButton("xm y+10 w380 h30", "Click 3")
click3Button.OnEvent("Click", Click3)

mainGui.SetFont("s10 w600", "Segoe UI")
click4Header := mainGui.AddText("xm y+16 c20252B", "Click 4")
mainGui.SetFont("s9 norm", "Segoe UI")
click4Label := mainGui.AddText("xm y+5 w230 h28 +0x200 BackgroundFFFFFF c66717D", "  Not set")
setClick4Button := mainGui.AddButton("x+10 yp w140 h28", "Coordinates Checker 4")
setClick4Button.OnEvent("Click", CaptureClick4)

mainGui.SetFont("s10 w600", "Segoe UI")
click5Header := mainGui.AddText("xm y+16 c20252B", "Click 5")
mainGui.SetFont("s9 norm", "Segoe UI")
click5Label := mainGui.AddText("xm y+5 w230 h28 +0x200 BackgroundFFFFFF c66717D", "  Not set")
setClick5Button := mainGui.AddButton("x+10 yp w140 h28", "Coordinates Checker 5")
setClick5Button.OnEvent("Click", CaptureClick5)

flow2Button := mainGui.AddButton("xm y+10 w380 h30", "Flow 2")
flow2Button.OnEvent("Click", RunFlow2)

toggleSizeButton := mainGui.AddButton("xm y+10 w380 h28", "Show Setup")
toggleSizeButton.OnEvent("Click", ToggleSize)

dividerLine := mainGui.AddText("xm y+18 w380 0x10")
statusLabel := mainGui.AddText("xm y+12 w380 h24 Center +0x200 BackgroundFFFFFF cA35B00", "STOPPED")

startButton := mainGui.AddButton("xm y+16 w118 h34", "Start")
stopButton := mainGui.AddButton("x+13 yp w118 h34", "Stop")
exitButton := mainGui.AddButton("x+13 yp w118 h34", "Exit")

startButton.OnEvent("Click", StartMacro)
stopButton.OnEvent("Click", StopMacro)
exitButton.OnEvent("Click", (*) => ExitApp())
mainGui.OnEvent("Close", (*) => ExitApp())

Hotkey("'", RunFlow)
Hotkey(";", Click3)
Hotkey("/", RunFlow2)

setupControls := [
    helpText,
    click1Header, click1Label, setClick1Button,
    click2Header, click2Label, setClick2Button,
    click3Header, click3Label, setClick3Button, click3Button,
    click4Header, click4Label, setClick4Button,
    click5Header, click5Label, setClick5Button,
    flow2Button
]

layoutControls := setupControls.Clone()
layoutControls.Push(titleText)
layoutControls.Push(toggleSizeButton)
layoutControls.Push(dividerLine)
layoutControls.Push(statusLabel)
layoutControls.Push(startButton)
layoutControls.Push(stopButton)
layoutControls.Push(exitButton)

originalPositions := Map()
for control in layoutControls {
    control.GetPos(&x, &y, &w, &h)
    originalPositions[control.Hwnd] := [x, y, w, h]
}

; Force the panel to stay pinned on top of active application layouts
mainGui.Opt("+AlwaysOnTop")
ApplyCompactMode(true)

ToggleSize(*) {
    global isCompact

    ApplyCompactMode(!isCompact)
}

ApplyCompactMode(compact) {
    global isCompact, mainGui, setupControls, layoutControls, originalPositions
    global titleText, toggleSizeButton, dividerLine, statusLabel, startButton, stopButton, exitButton

    isCompact := compact

    for control in setupControls
        control.Visible := !compact

    if compact {
        dividerLine.Visible := false
        titleText.Move(10, 8, 220, 28)
        toggleSizeButton.Move(10, 42, 220, 28)
        statusLabel.Move(10, 78, 220, 24)
        startButton.Move(10, 112, 68, 30)
        stopButton.Move(84, 112, 68, 30)
        exitButton.Move(158, 112, 72, 30)
        toggleSizeButton.Text := "Show Setup"
        mainGui.Show("w250 h158")
    } else {
        for control in layoutControls {
            pos := originalPositions[control.Hwnd]
            control.Move(pos[1], pos[2], pos[3], pos[4])
        }

        dividerLine.Visible := true
        toggleSizeButton.Text := "Small Mode"
        mainGui.Show("AutoSize")
    }
}

CaptureClick1(*) {
    global click1Set, click1X, click1Y, click1Label

    if CaptureNextPoint(&x, &y, "Click the location for Click 1") {
        click1X := x
        click1Y := y
        click1Set := true
        click1Label.Text := "  X: " x "    Y: " y
        UpdateReadyStatus()
    }
}

CaptureClick2(*) {
    global click2Set, click2X, click2Y, click2Label

    if CaptureNextPoint(&x, &y, "Click the location for Click 2") {
        click2X := x
        click2Y := y
        click2Set := true
        click2Label.Text := "  X: " x "    Y: " y
        UpdateReadyStatus()
    }
}

CaptureClick3(*) {
    global click3Set, click3X, click3Y, click3Label

    if CaptureNextPoint(&x, &y, "Click the location for Click 3") {
        click3X := x
        click3Y := y
        click3Set := true
        click3Label.Text := "  X: " x "    Y: " y
        UpdateReadyStatus()
    }
}

CaptureClick4(*) {
    global click4Set, click4X, click4Y, click4Label

    if CaptureNextPoint(&x, &y, "Click the location for Click 4") {
        click4X := x
        click4Y := y
        click4Set := true
        click4Label.Text := "  X: " x "    Y: " y
        UpdateReadyStatus()
    }
}

CaptureClick5(*) {
    global click5Set, click5X, click5Y, click5Label

    if CaptureNextPoint(&x, &y, "Click the location for Click 5") {
        click5X := x
        click5Y := y
        click5Set := true
        click5Label.Text := "  X: " x "    Y: " y
        UpdateReadyStatus()
    }
}

CaptureNextPoint(&x, &y, message) {
    global isCapturing, mainGui

    if isCapturing
        return false

    isCapturing := true
    mainGui.Hide()
    ToolTip(message ".`nPress Esc to cancel.")

    ; Wait for the button used on the GUI to be released before capturing.
    KeyWait("LButton")

    while true {
        if GetKeyState("Escape", "P") {
            KeyWait("Escape")
            ToolTip()
            mainGui.Show()
            isCapturing := false
            return false
        }

        if GetKeyState("LButton", "P") {
            MouseGetPos(&x, &y)
            KeyWait("LButton")
            ToolTip()
            mainGui.Show()
            isCapturing := false
            return true
        }

        Sleep(10)
    }
}

StartMacro(*) {
    global isEnabled, click1Set, click2Set, click4Set, click5Set, statusLabel

    if (!click1Set || !click2Set) && (!click4Set || !click5Set) {
        statusLabel.SetFont("cB42318")
        statusLabel.Text := "SET FLOW COORDINATES FIRST"
        return
    }

    isEnabled := true
    statusLabel.SetFont("c18794E")
    statusLabel.Text := "STARTED — PRESS ' OR / TO RUN"
}

StopMacro(*) {
    global isEnabled, statusLabel
    isEnabled := false
    statusLabel.SetFont("cA35B00")
    statusLabel.Text := "STOPPED"
}

UpdateReadyStatus() {
    global isEnabled, click1Set, click2Set, click4Set, click5Set, statusLabel

    if isEnabled {
        statusLabel.SetFont("c18794E")
        statusLabel.Text := "STARTED — PRESS ' OR / TO RUN"
    } else if (click1Set && click2Set) || (click4Set && click5Set) {
        statusLabel.SetFont("c245A8D")
        statusLabel.Text := "READY — CLICK START"
    }
}

RunFlow(*) {
    global isEnabled, isCapturing
    global click1Set, click2Set, click1X, click1Y, click2X, click2Y

    if !isEnabled || isCapturing || !click1Set || !click2Set
        return

    Click(click1X, click1Y)
    Sleep(100)
    MouseMove(click2X, click2Y)
    Send("{WheelDown}")
    Sleep(100)
    Click(click2X, click2Y)
    Sleep(100)
    Send("^v")
    Sleep(100)
    Send("{Enter}")
}

Click3(*) {
    global isCapturing

    if isCapturing
        return

    ClickNextButton()
}

ClickNextButton(showGuiAfter := true) {
    global click3Set, statusLabel, mainGui

    if !click3Set {
        statusLabel.SetFont("cB42318")
        statusLabel.Text := "SET CLICK 3 COORDINATE FIRST"
        return false
    }

    mainGui.Hide()
    Sleep(50)

    if FindNextButton(&nextX, &nextY) {
        Click(nextX, nextY)
        if showGuiAfter
            mainGui.Show("AutoSize")
        return true
    } else {
        if showGuiAfter
            mainGui.Show("AutoSize")
        statusLabel.SetFont("cB42318")
        statusLabel.Text := "NEXT BUTTON NOT FOUND"
        return false
    }
}

RunFlow2(*) {
    global isEnabled, isCapturing
    global click4Set, click5Set, click4X, click4Y, click5X, click5Y, statusLabel

    if !isEnabled || isCapturing
        return

    if !click4Set || !click5Set {
        statusLabel.SetFont("cB42318")
        statusLabel.Text := "SET CLICK 4 AND 5 FIRST"
        return
    }

    Click(click4X, click4Y)
    Sleep(100)
    MouseMove(click5X, click5Y)
    Send("{WheelDown}")
    Sleep(100)
    Click(click5X, click5Y)
    Sleep(100)
    Send("^v")
    Sleep(100)
    Send("{Enter}")
}

FindNextButton(&buttonX, &buttonY) {
    global click3X, click3Y

    searchLeft := Max(0, click3X - 450)
    searchTop := Max(0, click3Y - 850)
    searchRight := Min(A_ScreenWidth - 1, click3X + 450)
    searchBottom := Min(A_ScreenHeight - 1, click3Y + 850)

    ; Common blue shades used by the Next button. Search near the saved Click 3
    ; point so unrelated blue controls elsewhere on the screen are ignored.
    for blue in [0x0D5B97, 0x0D5E9F, 0x005EA8, 0x0067B1, 0x115C97] {
        nextLeft := searchLeft
        nextTop := searchTop

        while PixelSearch(&foundX, &foundY, nextLeft, nextTop, searchRight, searchBottom, blue, 30) {
            if GetBlueButtonCenter(foundX, foundY, searchLeft, searchTop, searchRight, searchBottom, &buttonX, &buttonY)
                return true

            if foundX < searchRight {
                nextLeft := foundX + 1
                nextTop := foundY
            } else {
                nextLeft := searchLeft
                nextTop := foundY + 1
                if nextTop > searchBottom
                    break
            }
        }
    }

    return false
}

GetBlueButtonCenter(startX, startY, limitLeft, limitTop, limitRight, limitBottom, &centerX, &centerY) {
    left := startX
    right := startX
    top := startY
    bottom := startY

    while left > limitLeft && IsNextButtonBlue(PixelGetColor(left - 1, startY))
        left -= 1
    while right < limitRight && IsNextButtonBlue(PixelGetColor(right + 1, startY))
        right += 1
    while top > limitTop && IsNextButtonBlue(PixelGetColor(startX, top - 1))
        top -= 1
    while bottom < limitBottom && IsNextButtonBlue(PixelGetColor(startX, bottom + 1))
        bottom += 1

    width := right - left + 1
    height := bottom - top + 1

    if width < 45 || width > 150 || height < 22 || height > 70
        return false

    centerX := Round((left + right) / 2)
    centerY := Round((top + bottom) / 2)
    return true
}

IsNextButtonBlue(color) {
    red := (color >> 16) & 0xFF
    green := (color >> 8) & 0xFF
    blue := color & 0xFF

    return blue >= 110 && green >= 60 && green <= 135 && red <= 45
}
