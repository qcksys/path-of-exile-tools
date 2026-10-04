import { useState } from "react";
import { Form, Link, useNavigation } from "react-router";
import { z } from "zod";
import { AppFooter } from "~/components/app-footer";
import { AppHeader } from "~/components/app-header";
import { checkRequestOrigin, operationError, readOperationBody } from "~/operations/http";
import { legacyPlannerRequest, runOperation } from "~/operations/legacy-planner.server";
import { operations } from "~/operations/registry.server";
import type { Route } from "./+types/integrations";

export function meta() {
    return [{ title: "API & MCP · POE.BOATS" }];
}

export function loader() {
    return {
        operations: operations.map(
            ({ name, family, method, path, description, access, ui, input, output }) => ({
                name,
                family,
                method: method.toUpperCase(),
                path: `/api/v1/${family}${path === "/" ? "" : path}`,
                description,
                access,
                ui,
                input: z.toJSONSchema(input, { io: "input" }),
                output: z.toJSONSchema(output),
            }),
        ),
    };
}

export async function action({ request, context }: Route.ActionArgs) {
    let form: FormData;
    try {
        checkRequestOrigin(request);
        const bytes = await readOperationBody(request);
        form = await new Response(bytes, { headers: request.headers }).formData();
    } catch (error) {
        const result = operationError(error);
        return Response.json(result.body, {
            status: result.status,
            headers: { "Cache-Control": "no-store" },
        });
    }
    const input = String(form.get("input") ?? "{}");
    const name = String(form.get("operation") ?? "");
    const operation = operations.find((entry) => entry.name === name);
    if (!operation) return Response.json({ error: "Unknown operation." }, { status: 404 });
    const jsonRequest = new Request(request.url, {
        method: "POST",
        headers: request.headers,
        body: input,
    });
    return legacyPlannerRequest(
        jsonRequest,
        context,
        (runtime, body) => runOperation(name, body, runtime),
        ["POST"],
        operation.access === "account",
    );
}

export default function Integrations({ loaderData, actionData }: Route.ComponentProps) {
    const [name, setName] = useState("calculate_recipe_scenario");
    const operation = loaderData.operations.find((entry) => entry.name === name)!;
    const navigation = useNavigation();
    const initial =
        name === "calculate_recipe_scenario" ? { inputCost: 10, outputValue: 15, buffer: 5 } : {};
    return (
        <div className="flex min-h-screen flex-col">
            <AppHeader section="API & MCP" />
            <main className="container mx-auto flex-1 space-y-6 px-4 py-8">
                <h1 className="font-heading text-3xl font-bold">Use POE.BOATS from your tools</h1>
                <p>
                    Explore the same operations used by the planner, market, and calculators.{" "}
                    <a className="underline" href="/api/openapi.json">
                        Download the OpenAPI contract
                    </a>
                    .
                </p>
                <div className="rounded-xl border border-border bg-card p-5 space-y-3">
                    <p>
                        Connect an MCP client to <code>/mcp</code> on this site's origin using
                        Streamable HTTP. Public calculations work without signing in. Account tools
                        require an <code>Authorization: Bearer</code> header with a valid Better
                        Auth session token.
                    </p>
                    <p>
                        Browser requests use your existing sign-in session. Browser-local planner
                        operations accept your state and return updated state. Saved-set operations
                        store data under your account; they do not change browser-local drafts
                        automatically.
                    </p>
                    <Link to="/login" className="underline">
                        Sign in for saved sets and account operations
                    </Link>
                </div>
                <Form
                    method="post"
                    className="grid gap-4 rounded-xl border border-border bg-card p-5"
                >
                    <label className="grid gap-2">
                        Operation
                        <select
                            name="operation"
                            value={name}
                            onChange={(event) => setName(event.target.value)}
                            className="rounded border border-border bg-background p-2"
                        >
                            {loaderData.operations.map((entry) => (
                                <option key={entry.name} value={entry.name}>
                                    {entry.family} · {entry.name}
                                </option>
                            ))}
                        </select>
                    </label>
                    <p>{operation.description}</p>
                    <p className="text-sm text-muted-foreground">
                        <code>
                            {operation.method} {operation.path}
                        </code>{" "}
                        · {operation.access === "account" ? "Sign-in required" : "Public"}
                    </p>
                    <label className="grid gap-2">
                        Input JSON
                        <textarea
                            key={name}
                            name="input"
                            rows={10}
                            defaultValue={JSON.stringify(initial, null, 2)}
                            required
                            className="w-full rounded border border-border bg-background p-3 font-mono text-sm"
                        />
                    </label>
                    <details>
                        <summary className="cursor-pointer">Input and result schemas</summary>
                        <pre className="overflow-auto text-xs">
                            {JSON.stringify(
                                { input: operation.input, output: operation.output },
                                null,
                                2,
                            )}
                        </pre>
                    </details>
                    <button
                        type="submit"
                        disabled={navigation.state !== "idle"}
                        className="justify-self-start rounded bg-primary px-4 py-2 font-medium text-primary-foreground"
                    >
                        {navigation.state === "idle" ? "Run operation" : "Running…"}
                    </button>
                </Form>
                {actionData !== undefined ? (
                    <section
                        aria-live="polite"
                        className="rounded-xl border border-border bg-card p-5"
                    >
                        <h2 className="text-lg font-semibold">Result</h2>
                        <pre className="mt-3 overflow-auto whitespace-pre-wrap text-sm">
                            {JSON.stringify(actionData, null, 2)}
                        </pre>
                    </section>
                ) : null}
            </main>
            <AppFooter />
        </div>
    );
}
