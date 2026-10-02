import * as prompts from "@clack/prompts";
import { Argument, Command, CommanderError, InvalidArgumentError, Option } from "commander";

export { Argument, Command, InvalidArgumentError, Option };

class Cancelled extends Error {}

function answer<T>(value: T | symbol): Exclude<T, symbol> {
    if (prompts.isCancel(value)) throw new Cancelled();
    return value as Exclude<T, symbol>;
}

export function positiveInteger(value: string): number {
    const number = Number(value);
    if (!/^\d+$/.test(value) || !Number.isSafeInteger(number) || number < 1)
        throw new InvalidArgumentError("Expected a positive integer.");
    return number;
}

async function promptValue(field: Argument | Option, current: unknown) {
    const output = process.stderr;
    const message = field.description || field.name();
    if (field instanceof Option && !field.required && !field.optional) {
        const enabled = answer(
            await prompts.confirm({
                message,
                initialValue: field.negate ? !current : !!current,
                output,
            }),
        );
        return field.negate ? !enabled : enabled;
    }
    if (field.argChoices) {
        return answer(
            await prompts.select({
                message,
                options: field.argChoices.map((value) => ({ value, label: value })),
                initialValue: typeof current === "string" ? current : undefined,
                output,
            }),
        );
    }
    const parse = (value: string) =>
        field.parseArg ? field.parseArg(value, field.defaultValue) : value;
    const value = answer(
        await prompts.text({
            message,
            defaultValue: current === undefined ? undefined : String(current),
            placeholder:
                current === undefined ? "Leave blank to use the command default" : String(current),
            output,
            validate(value) {
                if (!value) return;
                try {
                    parse(value);
                } catch (error) {
                    return error instanceof Error ? error.message : String(error);
                }
            },
        }),
    );
    return value ? parse(value) : current;
}

async function promptCommand(command: Command) {
    let prompted = false;
    for (const [index, field] of command.registeredArguments.entries()) {
        if (command.args[index] !== undefined) continue;
        command.processedArgs[index] = await promptValue(field, command.processedArgs[index]);
        prompted = true;
    }
    const seen = new Set(["interactive"]);
    for (const option of command.options) {
        const name = option.attributeName();
        if (seen.has(name) || command.getOptionValueSource(name) === "cli") continue;
        seen.add(name);
        command.setOptionValueWithSource(
            name,
            await promptValue(option, command.getOptionValue(name)),
            "prompt",
        );
        prompted = true;
    }
    if (
        !prompted &&
        !answer(
            await prompts.confirm({ message: `Run ${command.name()}?`, output: process.stderr }),
        )
    )
        throw new Cancelled();
}

export async function runCli(program: Command, argv = process.argv.slice(2)): Promise<number> {
    program
        .option("--interactive", "prompt for omitted arguments and options")
        .option("--no-interactive", "disable prompts")
        .showHelpAfterError()
        .exitOverride();
    const configure = (command: Command) => {
        command.exitOverride().showHelpAfterError();
        for (const child of command.commands) configure(child);
    };
    configure(program);
    let interactive = false;
    const terminal = !!process.stdin.isTTY && !!process.stderr.isTTY && !process.env.CI;
    try {
        if (!argv.length && program.commands.length) {
            if (!terminal) {
                program.outputHelp();
                return 0;
            }
            prompts.intro(program.description() || program.name(), { output: process.stderr });
            const selected = answer(
                await prompts.select({
                    message: "Choose a command",
                    options: program.commands.map((command) => ({
                        value: command.name(),
                        label: command.name(),
                        hint: command.description(),
                    })),
                    output: process.stderr,
                }),
            );
            argv = [selected, "--interactive"];
            interactive = true;
        }
        program.hook("preAction", async (_, action) => {
            if (!action.optsWithGlobals().interactive) return;
            if (!terminal)
                throw new Error(
                    "--interactive requires a terminal outside CI. Supply arguments and options instead.",
                );
            if (!interactive)
                prompts.intro(program.description() || program.name(), { output: process.stderr });
            interactive = true;
            await promptCommand(action);
        });
        await program.parseAsync(argv, { from: "user" });
        if (interactive) prompts.outro("Done", { output: process.stderr });
        return 0;
    } catch (error) {
        if (error instanceof Cancelled) {
            prompts.cancel("Cancelled", { output: process.stderr });
            return 130;
        }
        if (error instanceof CommanderError) return error.exitCode;
        const message = error instanceof Error ? error.message : String(error);
        if (interactive) prompts.log.error(message, { output: process.stderr });
        else program.configureOutput().writeErr?.(`${message}\n`);
        return 1;
    }
}
