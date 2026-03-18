//go:build windows

package main

import "os/exec"

func configureChildProcess(cmd *exec.Cmd) {
}

func terminateChildProcess(cmd *exec.Cmd) {
	if cmd == nil || cmd.Process == nil || cmd.ProcessState != nil && cmd.ProcessState.Exited() {
		return
	}
	_ = cmd.Process.Kill()
}
