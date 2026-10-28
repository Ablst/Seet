import { useEffect, useRef, useState } from "react";
import { apiRequest } from "./api.mjs";
const signatureFor = (w) =>
  JSON.stringify([
    w.dataset,
    w.draft,
    w.messages.slice(-100),
    w.chart,
    w.sort,
    w.metricKey,
    w.tab,
    w.view || null,
    w.report || null,
  ]);
const rememberActive = (owner, id) => {
  try {
    localStorage.setItem("seet:active:" + owner, id);
  } catch {}
};
const preferredActive = (owner) => {
  try {
    return localStorage.getItem("seet:active:" + owner);
  } catch {
    return null;
  }
};

export const emptyWorkspace = () => ({
  dataset: null,
  draft: null,
  messages: [
    {
      role: "assistant",
      text: "你好，我是见数。输入数据、上传文件，或告诉我你想分析什么。",
    },
  ],
  chart: "bar",
  sort: false,
  metricKey: "",
  view: null,
  tab: "chart",
  report: null,
});
export function useRecords(user, snapshot, restore) {
  const [records, setRecords] = useState([]),
    [activeId, setActiveId] = useState(() => crypto.randomUUID()),
    [ready, setReady] = useState(false),
    [loading, setLoading] = useState(false),
    [status, setStatus] = useState("idle"),
    [saveError, setSaveError] = useState("");
  const latest = useRef(snapshot),
    apply = useRef(restore),
    identity = useRef(user?.username),
    loadedOwner = useRef(null),
    idRef = useRef(activeId),
    saved = useRef(""),
    queue = useRef(Promise.resolve()),
    timer = useRef(null),
    loadVersion = useRef(0);
  latest.current = snapshot;
  apply.current = restore;
  identity.current = user?.username;
  idRef.current = activeId;
  const meaningful = (s) =>
    Boolean(s.dataset || s.draft || s.messages.some((m) => m.role === "user"));
  async function saveNow() {
    clearTimeout(timer.current);
    const owner = identity.current,
      id = idRef.current,
      state = latest.current;
    if (
      !owner ||
      loadedOwner.current !== owner ||
      (!meaningful(state) && !saved.current)
    )
      return;
    const workspace = { ...state, messages: state.messages.slice(-100) },
      signature = signatureFor(workspace);
    if (signature === saved.current) return;
    setStatus("saving");
    setSaveError("");
    const job = queue.current
      .catch(() => {})
      .then(async () => {
        if (identity.current !== owner || loadedOwner.current !== owner) return;
        const result = await apiRequest(
          "/api/analyses/" + id,
          { workspace, owner },
          { method: "PUT" },
        );
        if (identity.current !== owner || idRef.current !== id) return;
        saved.current = signature;
        rememberActive(owner, id);
        setStatus(
          signatureFor(latest.current) === signature ? "saved" : "pending",
        );
        const data = workspace.dataset || workspace.draft;
        setRecords((items) => [
          {
            id,
            title: result.title,
            updatedAt: result.updatedAt,
            rows: data?.rows.length || 0,
            metrics: data?.metrics.length || 0,
          },
          ...items.filter((r) => r.id !== id),
        ]);
      });
    queue.current = job;
    try {
      await job;
    } catch (e) {
      if (identity.current === owner) {
        setStatus("error");
        setSaveError(e.message);
      }
      throw e;
    }
  }
  useEffect(() => {
    const token = ++loadVersion.current;
    clearTimeout(timer.current);
    loadedOwner.current = null;
    setReady(false);
    setRecords([]);
    saved.current = "";
    setStatus("idle");
    setSaveError("");
    if (!user) {
      apply.current(emptyWorkspace());
      return;
    }
    const owner = user.username;
    (async () => {
      try {
        const result = await apiRequest("/api/analyses", undefined, {
          headers: { "X-Workspace-Owner": encodeURIComponent(owner) },
        });
        if (token !== loadVersion.current || identity.current !== owner) return;
        setRecords(result.records);
        if (result.records.length) {
          const preferred = preferredActive(owner);
          const restoreId = result.records.some((r) => r.id === preferred)
            ? preferred
            : result.records[0].id;
          const { record } = await apiRequest(
            "/api/analyses/" + restoreId,
            undefined,
            { headers: { "X-Workspace-Owner": encodeURIComponent(owner) } },
          );
          if (token !== loadVersion.current || identity.current !== owner)
            return;
          setActiveId(record.id);
          idRef.current = record.id;
          apply.current(record.workspace);
          saved.current = signatureFor(record.workspace);
          setStatus("saved");
        } else {
          const id = crypto.randomUUID();
          setActiveId(id);
          idRef.current = id;
          apply.current(emptyWorkspace());
        }
        loadedOwner.current = owner;
        setReady(true);
      } catch (e) {
        if (token === loadVersion.current) {
          setStatus("load-error");
          setSaveError(e.message);
        }
      }
    })();
    return () => {
      clearTimeout(timer.current);
    };
  }, [user?.username]);
  useEffect(() => {
    if (
      !ready ||
      loading ||
      !user ||
      loadedOwner.current !== user.username ||
      (!meaningful(snapshot) && !saved.current)
    )
      return;
    const signature = signatureFor(snapshot);
    if (signature === saved.current) return;
    setStatus("pending");
    timer.current = setTimeout(() => saveNow().catch(() => {}), 650);
    return () => clearTimeout(timer.current);
  }, [snapshot, ready, loading, user?.username]);
  useEffect(() => {
    const prevent = (e) => {
      if (["pending", "saving", "error"].includes(status)) {
        e.preventDefault();
        e.returnValue = "";
      }
    };
    window.addEventListener("beforeunload", prevent);
    return () => window.removeEventListener("beforeunload", prevent);
  }, [status]);
  async function openRecord(id) {
    if (loading) return;
    setLoading(true);
    try {
      await saveNow();
      const owner = identity.current;
      const { record } = await apiRequest("/api/analyses/" + id, undefined, {
        headers: { "X-Workspace-Owner": encodeURIComponent(owner) },
      });
      if (owner !== identity.current) return;
      apply.current(record.workspace);
      setActiveId(record.id);
      idRef.current = record.id;
      saved.current = signatureFor(record.workspace);
      rememberActive(owner, record.id);
      setStatus("saved");
    } catch (e) {
      setSaveError(e.message);
      setStatus("error");
    } finally {
      setLoading(false);
    }
  }
  async function newRecord() {
    if (loading) return;
    setLoading(true);
    try {
      await saveNow();
      const id = crypto.randomUUID();
      setActiveId(id);
      idRef.current = id;
      saved.current = "";
      apply.current(emptyWorkspace());
      setStatus("idle");
    } catch (e) {
      setStatus("error");
      setSaveError(e.message);
    } finally {
      setLoading(false);
    }
  }
  async function deleteRecord(id) {
    if (loading) return;
    const owner = identity.current;
    setLoading(true);
    clearTimeout(timer.current);
    setSaveError("");
    try {
      await saveNow();
      if (identity.current !== owner) return;
      await apiRequest("/api/analyses/" + id, { owner }, { method: "DELETE" });
      if (identity.current !== owner) return;
      setRecords((items) => items.filter((r) => r.id !== id));
      if (idRef.current === id) {
        const next = crypto.randomUUID();
        saved.current = "";
        idRef.current = next;
        setActiveId(next);
        rememberActive(owner, next);
        apply.current(emptyWorkspace());
        setStatus("idle");
      }
      return true;
    } catch (e) {
      if (identity.current === owner) setSaveError(e.message);
      return false;
    } finally {
      if (identity.current === owner) setLoading(false);
    }
  }
  async function restoreRecord(id) {
    if (loading) return;
    const owner = identity.current;
    setLoading(true);
    setSaveError("");
    try {
      await apiRequest("/api/analyses/" + id + "/restore", { owner });
      const result = await apiRequest("/api/analyses", undefined, {
        headers: { "X-Workspace-Owner": encodeURIComponent(owner) },
      });
      if (identity.current === owner) setRecords(result.records);
      return true;
    } catch (e) {
      if (identity.current === owner) setSaveError(e.message);
      return false;
    } finally {
      if (identity.current === owner) setLoading(false);
    }
  }
  return {
    records,
    activeId,
    ready,
    loading,
    status,
    error: saveError,
    saveNow,
    openRecord,
    newRecord,
    deleteRecord,
    restoreRecord,
  };
}
