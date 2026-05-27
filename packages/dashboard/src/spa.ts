export interface DashboardHtmlOptions {
  readonly basePath: string;
  readonly title?: string;
}

export function renderTypedQueueDashboardHtml(options: DashboardHtmlOptions): string {
  const title = options.title ?? "typed-queue dashboard";
  const config = JSON.stringify({
    basePath: options.basePath,
    title
  });

  return `<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>${title}</title>
    <style>
      :root {
        color-scheme: light;
        font-family: Inter, ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
        background: #f7f8f5;
        color: #17201b;
      }

      * {
        box-sizing: border-box;
      }

      body {
        margin: 0;
      }

      button,
      input,
      select,
      textarea {
        font: inherit;
      }

      button {
        align-items: center;
        background: #1f5c4a;
        border: 1px solid #1f5c4a;
        border-radius: 6px;
        color: #ffffff;
        cursor: pointer;
        display: inline-flex;
        font-weight: 650;
        min-height: 34px;
        padding: 0 12px;
      }

      button.secondary {
        background: #ffffff;
        color: #1f5c4a;
      }

      button.danger {
        background: #8f2f36;
        border-color: #8f2f36;
      }

      button:disabled {
        cursor: not-allowed;
        opacity: 0.55;
      }

      input,
      select,
      textarea {
        background: #ffffff;
        border: 1px solid #cad3cc;
        border-radius: 6px;
        color: inherit;
        min-height: 34px;
        padding: 6px 9px;
        width: 100%;
      }

      textarea {
        font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, "Liberation Mono", monospace;
        min-height: 118px;
        resize: vertical;
      }

      .shell {
        min-height: 100vh;
      }

      .topbar {
        align-items: center;
        background: #ffffff;
        border-bottom: 1px solid #dfe5df;
        display: flex;
        gap: 16px;
        justify-content: space-between;
        padding: 16px 22px;
      }

      .brand {
        display: flex;
        flex-direction: column;
        gap: 2px;
      }

      .brand strong {
        font-size: 17px;
      }

      .brand span {
        color: #65736b;
        font-size: 13px;
      }

      .content {
        display: grid;
        gap: 18px;
        grid-template-columns: minmax(280px, 360px) minmax(0, 1fr);
        padding: 20px;
      }

      .panel {
        background: #ffffff;
        border: 1px solid #dfe5df;
        border-radius: 8px;
        padding: 16px;
      }

      .panel h2 {
        font-size: 15px;
        margin: 0 0 12px;
      }

      .field {
        display: grid;
        gap: 6px;
        margin-bottom: 12px;
      }

      .field label {
        color: #3f4c45;
        font-size: 12px;
        font-weight: 700;
      }

      .tabs {
        display: flex;
        flex-wrap: wrap;
        gap: 8px;
        margin-bottom: 14px;
      }

      .tabs button {
        background: #ffffff;
        border-color: #cad3cc;
        color: #26362e;
      }

      .tabs button.active {
        background: #20342c;
        border-color: #20342c;
        color: #ffffff;
      }

      .toolbar {
        align-items: end;
        display: grid;
        gap: 10px;
        grid-template-columns: minmax(160px, 1fr) minmax(130px, 170px) auto auto;
        margin-bottom: 14px;
      }

      .notice {
        background: #eef6f2;
        border: 1px solid #c9dfd5;
        border-radius: 8px;
        color: #254436;
        margin-bottom: 14px;
        padding: 10px 12px;
      }

      .error {
        background: #fff0f1;
        border-color: #e3b7bd;
        color: #7a222a;
      }

      .table-wrap {
        border: 1px solid #dfe5df;
        border-radius: 8px;
        overflow: auto;
      }

      table {
        border-collapse: collapse;
        min-width: 980px;
        width: 100%;
      }

      th,
      td {
        border-bottom: 1px solid #edf1ed;
        font-size: 13px;
        padding: 10px;
        text-align: left;
        vertical-align: top;
      }

      th {
        background: #f2f5f1;
        color: #4b5a51;
        font-size: 12px;
        position: sticky;
        top: 0;
        z-index: 1;
      }

      tr:last-child td {
        border-bottom: 0;
      }

      code,
      pre {
        font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, "Liberation Mono", monospace;
      }

      pre {
        margin: 0;
        max-height: 140px;
        overflow: auto;
        white-space: pre-wrap;
      }

      .actions {
        display: flex;
        flex-wrap: wrap;
        gap: 8px;
      }

      .muted {
        color: #65736b;
      }

      @media (max-width: 920px) {
        .content {
          grid-template-columns: 1fr;
        }

        .toolbar {
          grid-template-columns: 1fr;
        }
      }
    </style>
  </head>
  <body>
    <div id="root"></div>
    <script>
      window.__TYPED_QUEUE_DASHBOARD__ = ${config};
    </script>
    <script type="module">
      import React, { useCallback, useEffect, useMemo, useState } from "https://esm.sh/react@18.3.1";
      import { createRoot } from "https://esm.sh/react-dom@18.3.1/client";

      const config = window.__TYPED_QUEUE_DASHBOARD__;
      const h = React.createElement;

      const views = [
        ["registered", "Registered"],
        ["archived", "Archive"],
        ["dead-letter", "DLQ"]
      ];

      function api(path, init) {
        const headers = Object.assign({ "content-type": "application/json" }, init && init.headers);
        return fetch(config.basePath + "/api" + path, Object.assign({}, init, { headers })).then(async (response) => {
          const text = await response.text();
          const data = text ? JSON.parse(text) : undefined;

          if (!response.ok) {
            throw new Error((data && data.error && data.error.message) || (data && data.error) || response.statusText);
          }

          return data;
        });
      }

      function pretty(value) {
        return JSON.stringify(value, null, 2);
      }

      function parseJson(value) {
        if (!value.trim()) {
          return {};
        }

        return JSON.parse(value);
      }

      function App() {
        const [status, setStatus] = useState({ ok: false, queues: [] });
        const [view, setView] = useState("registered");
        const [queue, setQueue] = useState("");
        const [day, setDay] = useState("");
        const [jobs, setJobs] = useState([]);
        const [loading, setLoading] = useState(false);
        const [notice, setNotice] = useState("");
        const [error, setError] = useState("");
        const [dispatchQueue, setDispatchQueue] = useState("");
        const [dispatchPayload, setDispatchPayload] = useState("{}");

        const selectedQueue = dispatchQueue || queue || status.queues[0] || "";

        const loadStatus = useCallback(() => {
          return api("/status").then((next) => {
            setStatus(next);
            if (!dispatchQueue && next.queues[0]) {
              setDispatchQueue(next.queues[0]);
            }
          });
        }, [dispatchQueue]);

        const loadJobs = useCallback(() => {
          setLoading(true);
          setError("");

          const params = new URLSearchParams({ view });
          if (queue) params.set("queue", queue);
          if (day) params.set("day", day);

          return api("/jobs?" + params.toString())
            .then((next) => setJobs(next.jobs))
            .catch((err) => setError(err.message))
            .finally(() => setLoading(false));
        }, [day, queue, view]);

        useEffect(() => {
          loadStatus().catch((err) => setError(err.message));
        }, [loadStatus]);

        useEffect(() => {
          loadJobs();
        }, [loadJobs]);

        const queues = useMemo(() => status.queues || [], [status]);

        function runAction(action) {
          setError("");
          setNotice("");
          return action()
            .then((message) => {
              setNotice(message);
              return Promise.all([loadStatus(), loadJobs()]);
            })
            .catch((err) => setError(err.message));
        }

        function dispatchJob(event) {
          event.preventDefault();
          return runAction(() =>
            api("/dispatch", {
              method: "POST",
              body: JSON.stringify({
                queue: selectedQueue,
                payload: parseJson(dispatchPayload)
              })
            }).then((job) => "Dispatched " + job.id),
          );
        }

        function removeJob(id) {
          return runAction(() =>
            api("/jobs/" + encodeURIComponent(id), { method: "DELETE" }).then(
              () => "Removed " + id,
            ),
          );
        }

        function retryJob(id) {
          return runAction(() =>
            api("/jobs/" + encodeURIComponent(id) + "/retry", { method: "POST" }).then(
              () => "Retried " + id,
            ),
          );
        }

        function clearArchive() {
          const params = new URLSearchParams();
          if (queue) params.set("queue", queue);
          if (day) params.set("day", day);

          return runAction(() =>
            api("/archives?" + params.toString(), { method: "DELETE" }).then(
              (result) => "Cleared " + result.removed.length + " archived job(s)",
            ),
          );
        }

        return h("div", { className: "shell" },
          h("header", { className: "topbar" },
            h("div", { className: "brand" },
              h("strong", null, config.title),
              h("span", null, queues.length + " queue definition(s)")
            ),
            h("button", { className: "secondary", onClick: loadJobs, disabled: loading }, loading ? "Loading" : "Refresh")
          ),
          h("main", { className: "content" },
            h("section", { className: "panel" },
              h("h2", null, "Dispatch"),
              h("form", { onSubmit: dispatchJob },
                h("div", { className: "field" },
                  h("label", null, "Queue"),
                  h("select", { value: selectedQueue, onChange: (event) => setDispatchQueue(event.target.value) },
                    queues.map((name) => h("option", { key: name, value: name }, name))
                  )
                ),
                h("div", { className: "field" },
                  h("label", null, "Payload JSON"),
                  h("textarea", { value: dispatchPayload, onChange: (event) => setDispatchPayload(event.target.value) })
                ),
                h("button", { disabled: !selectedQueue }, "Dispatch")
              )
            ),
            h("section", { className: "panel" },
              h("div", { className: "tabs" },
                views.map(([id, label]) =>
                  h("button", {
                    key: id,
                    className: view === id ? "active" : "",
                    onClick: () => setView(id)
                  }, label)
                )
              ),
              h("div", { className: "toolbar" },
                h("div", { className: "field" },
                  h("label", null, "Queue"),
                  h("select", { value: queue, onChange: (event) => setQueue(event.target.value) },
                    h("option", { value: "" }, "All queues"),
                    queues.map((name) => h("option", { key: name, value: name }, name))
                  )
                ),
                h("div", { className: "field" },
                  h("label", null, "Archive day"),
                  h("input", { type: "date", value: day, onChange: (event) => setDay(event.target.value) })
                ),
                h("button", { className: "secondary", onClick: loadJobs, disabled: loading }, "Apply"),
                h("button", { className: "danger", onClick: clearArchive, disabled: view !== "archived" }, "Clear archive")
              ),
              notice ? h("div", { className: "notice" }, notice) : null,
              error ? h("div", { className: "notice error" }, error) : null,
              h("div", { className: "table-wrap" },
                h("table", null,
                  h("thead", null,
                    h("tr", null,
                      h("th", null, "ID"),
                      h("th", null, "Queue"),
                      h("th", null, "State"),
                      h("th", null, "Attempts"),
                      h("th", null, "Ready"),
                      h("th", null, "Payload"),
                      h("th", null, "Error"),
                      h("th", null, "Actions")
                    )
                  ),
                  h("tbody", null,
                    jobs.length === 0
                      ? h("tr", null, h("td", { colSpan: 8, className: "muted" }, "No jobs"))
                      : jobs.map((job) =>
                          h("tr", { key: job.id },
                            h("td", null, h("code", null, job.id)),
                            h("td", null, job.name),
                            h("td", null, job.status),
                            h("td", null, job.retries.attempts + " / " + job.retries.maxAttempts),
                            h("td", null, job.readyAt ? new Date(job.readyAt).toLocaleString() : ""),
                            h("td", null, h("pre", null, pretty(job.input))),
                            h("td", null, job.error ? h("pre", null, job.error.message) : ""),
                            h("td", null,
                              h("div", { className: "actions" },
                                view === "dead-letter"
                                  ? h("button", { className: "secondary", onClick: () => retryJob(job.id) }, "Retry")
                                  : null,
                                view === "registered"
                                  ? h("button", { className: "danger", onClick: () => removeJob(job.id) }, "Remove")
                                  : null
                              )
                            )
                          )
                        )
                  )
                )
              )
            )
          )
        );
      }

      createRoot(document.getElementById("root")).render(h(App));
    </script>
  </body>
</html>`;
}
