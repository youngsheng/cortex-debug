import { DebugProtocol } from 'vscode-debugprotocol';
import { TelemetryEvent, ConfigurationArguments, GDBServerController, SWOConfigureEvent, calculatePortMask } from './common';
import * as os from 'os';
import { EventEmitter } from 'events';

export class BMPServerController extends EventEmitter implements GDBServerController {
	name: string = 'BMP';
	portsNeeded: string[] = [];

	private args: ConfigurationArguments;
	private ports: { [name: string]: number };

	constructor() {
		super();
	}

	public setPorts(ports: { [name: string]: number }): void {
		this.ports = ports;
	}

	public setArguments(args: ConfigurationArguments): void {
		this.args = args;
	}

	public customRequest(command: string, response: DebugProtocol.Response, args: any): boolean {
		return false;
	}

	public launchCommands(): string[] {
		let gdbport = this.ports['gdbPort'];

		let commands = [
			`interpreter-exec console "source ${this.args.extensionPath}/support/gdbsupport.init"`,
			`target-select extended-remote ${this.args.BMPGDBSerialPort}`,
			'interpreter-exec console "monitor swdp_scan"',
			`interpreter-exec console "attach 1"`,
			'interpreter-exec console "set mem inaccessible-by-default off"',
			'target-download',
			'interpreter-exec console "SoftwareReset"',
			'enable-pretty-printing'
		];

		if (this.args.swoConfig.enabled) {
			let swocommands = this.SWOConfigurationCommands();
			commands.push(...swocommands);
		}

		return commands;
	}

	public attachCommands(): string[] {
		let commands = [
			`interpreter-exec console "source ${this.args.extensionPath}/support/gdbsupport.init"`,
			`target-select extended-remote ${this.args.BMPGDBSerialPort}`,
			'interpreter-exec console "monitor swdp_scan"',
			`interpreter-exec console "attach 1"`,
			'interpreter-exec console "set mem inaccessible-by-default off"',
			'enable-pretty-printing'
		];

		if (this.args.swoConfig.enabled) {
			let swocommands = this.SWOConfigurationCommands();
			commands.push(...swocommands);
		}

		return commands;
	}

	public restartCommands(): string[] {
		let commands : string[] = [
			'exec-interrupt',
			'interpreter-exec console "SoftwareReset"',
			'exec-step-instruction'
		];

		if (this.args.swoConfig.enabled) {
			let swocommands = this.SWOConfigurationCommands();
			commands.push(...swocommands);
		}

		return commands;
	}

	private SWOConfigurationCommands(): string[] {
		let portMask = '0x' + calculatePortMask(this.args.swoConfig.decoders).toString(16);
		let swoFrequency = this.args.swoConfig.swoFrequency;
		let cpuFrequency = this.args.swoConfig.cpuFrequency;

		let ratio = Math.floor(cpuFrequency / swoFrequency) - 1;
		
		let commands: string[] = [];

		commands.push(
			'EnableITMAccess',
			`BaseSWOSetup ${ratio}`,
			'SetITMId 1',
			'ITMDWTTransferEnable',
			'DisableITMPorts 0xFFFFFFFF',
			`EnableITMPorts ${portMask}`,
			'EnableDWTSync',
			'ITMSyncEnable',
			'ITMGlobalEnable'
		);

		commands.push(this.args.swoConfig.profile ? 'EnablePCSample' : 'DisablePCSample');
		
		return commands.map(c => `interpreter-exec console "${c}"`);
	}

	public serverExecutable(): string {
		return null;
	}

	public serverArguments(): string[] {
		return [];
	}

	public initMatch(): RegExp {
		return null;
	}

	public serverLaunchStarted(): void {}
	public serverLaunchCompleted(): void {
		if (this.args.swoConfig.enabled && this.args.swoConfig.source !== 'probe') {
			this.emit('event', new SWOConfigureEvent({ type: 'serial', device: this.args.swoConfig.source, baudRate: this.args.swoConfig.swoFrequency }));
		}
	}
	
	public debuggerLaunchStarted(): void {}
	public debuggerLaunchCompleted(): void {}
}