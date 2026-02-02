"use client";

import { useState, useEffect } from "react";
import { useParams, useRouter } from "next/navigation";
import { usePersona } from "@/hooks/use-personas";
import type { PersonaConfig } from "@pipeline/types.js";
import Link from "next/link";

export default function PersonaEditorPage() {
  const { slug } = useParams<{ slug: string }>();
  const router = useRouter();
  const { persona, isLoading } = usePersona(slug);
  const [form, setForm] = useState<PersonaConfig | null>(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [newExample, setNewExample] = useState({ original: "", rewritten: "" });

  useEffect(() => {
    if (persona && !form) setForm(persona);
  }, [persona, form]);

  const handleSave = async () => {
    if (!form) return;
    setSaving(true);
    setError(null);

    const res = await fetch(`/api/personas/${slug}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(form),
    });

    const data = await res.json();
    setSaving(false);

    if (!res.ok) {
      setError(data.error ?? "Failed to save");
      return;
    }

    // If slug changed (name changed), redirect
    if (data.slug !== slug) {
      router.push(`/personas/${data.slug}`);
    }
  };

  const addExample = () => {
    if (!form || !newExample.original.trim() || !newExample.rewritten.trim()) return;
    setForm({
      ...form,
      examples: [...form.examples, { ...newExample }],
    });
    setNewExample({ original: "", rewritten: "" });
  };

  const removeExample = (index: number) => {
    if (!form) return;
    setForm({
      ...form,
      examples: form.examples.filter((_, i) => i !== index),
    });
  };

  const removeRule = (index: number) => {
    if (!form) return;
    setForm({ ...form, rules: form.rules.filter((_, i) => i !== index) });
  };

  if (isLoading || !form) {
    return (
      <div className="max-w-3xl">
        <h2 className="text-2xl font-bold text-white mb-6">Edit Persona</h2>
        <div className="text-zinc-500 text-sm">Loading...</div>
      </div>
    );
  }

  return (
    <div className="max-w-3xl">
      <div className="flex items-center justify-between mb-6">
        <div className="flex items-center gap-3">
          <Link
            href="/personas"
            className="text-zinc-500 hover:text-zinc-300 text-sm"
          >
            &larr; Personas
          </Link>
          <h2 className="text-2xl font-bold text-white">{form.name}</h2>
        </div>
        <button
          onClick={handleSave}
          disabled={saving}
          className="px-3 py-1.5 text-sm font-medium rounded bg-green-600 text-white hover:bg-green-500 transition-colors disabled:opacity-50"
        >
          {saving ? "Saving..." : "Save"}
        </button>
      </div>

      {error && <div className="text-sm text-red-400 mb-4">{error}</div>}

      <div className="space-y-4">
        {/* Identity */}
        <div className="rounded-lg border border-zinc-800 bg-zinc-900 p-4">
          <h3 className="text-xs font-medium text-zinc-500 mb-3">IDENTITY</h3>
          <div className="space-y-3">
            <div>
              <label className="text-xs text-zinc-500 block mb-1">Name</label>
              <input
                type="text"
                value={form.name}
                onChange={(e) => setForm({ ...form, name: e.target.value })}
                className="w-full bg-zinc-800 border border-zinc-700 rounded px-3 py-2 text-sm text-zinc-200 focus:outline-none focus:border-blue-500"
              />
            </div>
            <div>
              <label className="text-xs text-zinc-500 block mb-1">Bio</label>
              <textarea
                value={form.bio}
                onChange={(e) => setForm({ ...form, bio: e.target.value })}
                rows={2}
                className="w-full bg-zinc-800 border border-zinc-700 rounded px-3 py-2 text-sm text-zinc-200 focus:outline-none focus:border-blue-500 resize-none"
              />
            </div>
          </div>
        </div>

        {/* Voice */}
        <div className="rounded-lg border border-zinc-800 bg-zinc-900 p-4">
          <h3 className="text-xs font-medium text-zinc-500 mb-3">VOICE</h3>
          <div className="space-y-3">
            <div>
              <label className="text-xs text-zinc-500 block mb-1">Tone</label>
              <input
                type="text"
                value={form.voice.tone}
                onChange={(e) => setForm({ ...form, voice: { ...form.voice, tone: e.target.value } })}
                className="w-full bg-zinc-800 border border-zinc-700 rounded px-3 py-2 text-sm text-zinc-200 focus:outline-none focus:border-blue-500"
              />
            </div>
            <div>
              <label className="text-xs text-zinc-500 block mb-1">Style</label>
              <input
                type="text"
                value={form.voice.style}
                onChange={(e) => setForm({ ...form, voice: { ...form.voice, style: e.target.value } })}
                className="w-full bg-zinc-800 border border-zinc-700 rounded px-3 py-2 text-sm text-zinc-200 focus:outline-none focus:border-blue-500"
              />
            </div>
            <div>
              <label className="text-xs text-zinc-500 block mb-1">Vocabulary (comma-separated)</label>
              <input
                type="text"
                value={form.voice.vocabulary.join(", ")}
                onChange={(e) => setForm({ ...form, voice: { ...form.voice, vocabulary: e.target.value.split(",").map((s) => s.trim()).filter(Boolean) } })}
                className="w-full bg-zinc-800 border border-zinc-700 rounded px-3 py-2 text-sm text-zinc-200 focus:outline-none focus:border-blue-500"
              />
            </div>
            <div>
              <label className="text-xs text-zinc-500 block mb-1">Avoid (comma-separated)</label>
              <input
                type="text"
                value={form.voice.avoid.join(", ")}
                onChange={(e) => setForm({ ...form, voice: { ...form.voice, avoid: e.target.value.split(",").map((s) => s.trim()).filter(Boolean) } })}
                className="w-full bg-zinc-800 border border-zinc-700 rounded px-3 py-2 text-sm text-zinc-200 focus:outline-none focus:border-blue-500"
              />
            </div>
          </div>
        </div>

        {/* Topics */}
        <div className="rounded-lg border border-zinc-800 bg-zinc-900 p-4">
          <h3 className="text-xs font-medium text-zinc-500 mb-3">TOPICS</h3>
          <div className="space-y-3">
            <div>
              <label className="text-xs text-zinc-500 block mb-1">Interests (comma-separated)</label>
              <input
                type="text"
                value={form.topics.interests.join(", ")}
                onChange={(e) => setForm({ ...form, topics: { ...form.topics, interests: e.target.value.split(",").map((s) => s.trim()).filter(Boolean) } })}
                className="w-full bg-zinc-800 border border-zinc-700 rounded px-3 py-2 text-sm text-zinc-200 focus:outline-none focus:border-blue-500"
              />
            </div>
            <div>
              <label className="text-xs text-zinc-500 block mb-1">Expertise (comma-separated)</label>
              <input
                type="text"
                value={form.topics.expertise.join(", ")}
                onChange={(e) => setForm({ ...form, topics: { ...form.topics, expertise: e.target.value.split(",").map((s) => s.trim()).filter(Boolean) } })}
                className="w-full bg-zinc-800 border border-zinc-700 rounded px-3 py-2 text-sm text-zinc-200 focus:outline-none focus:border-blue-500"
              />
            </div>
            <div>
              <label className="text-xs text-zinc-500 block mb-1">Avoid (comma-separated)</label>
              <input
                type="text"
                value={form.topics.avoid.join(", ")}
                onChange={(e) => setForm({ ...form, topics: { ...form.topics, avoid: e.target.value.split(",").map((s) => s.trim()).filter(Boolean) } })}
                className="w-full bg-zinc-800 border border-zinc-700 rounded px-3 py-2 text-sm text-zinc-200 focus:outline-none focus:border-blue-500"
              />
            </div>
          </div>
        </div>

        {/* Rules */}
        <div className="rounded-lg border border-zinc-800 bg-zinc-900 p-4">
          <h3 className="text-xs font-medium text-zinc-500 mb-3">RULES ({form.rules.length})</h3>
          <ul className="space-y-1">
            {form.rules.map((rule, i) => (
              <li key={i} className="flex items-start gap-2 text-sm text-zinc-300">
                <span className="text-zinc-600 shrink-0">{i + 1}.</span>
                <span className="flex-1">{rule}</span>
                <button
                  onClick={() => removeRule(i)}
                  className="text-red-400 text-xs hover:text-red-300 shrink-0"
                >
                  remove
                </button>
              </li>
            ))}
          </ul>
          <div className="mt-3 flex gap-2">
            <input
              type="text"
              placeholder="Add a rule..."
              className="flex-1 bg-zinc-800 border border-zinc-700 rounded px-3 py-1.5 text-sm text-zinc-200 focus:outline-none focus:border-blue-500"
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  const val = (e.target as HTMLInputElement).value.trim();
                  if (val && form) {
                    setForm({ ...form, rules: [...form.rules, val] });
                    (e.target as HTMLInputElement).value = "";
                  }
                }
              }}
            />
          </div>
        </div>

        {/* Examples */}
        <div className="rounded-lg border border-zinc-800 bg-zinc-900 p-4">
          <h3 className="text-xs font-medium text-zinc-500 mb-3">EXAMPLES ({form.examples.length})</h3>
          <div className="space-y-3">
            {form.examples.map((ex, i) => (
              <div key={i} className="bg-zinc-800 rounded p-3">
                <div className="text-xs text-zinc-500 mb-1">Original:</div>
                <div className="text-sm text-zinc-400 mb-2">{ex.original}</div>
                <div className="text-xs text-zinc-500 mb-1">Rewritten:</div>
                <div className="text-sm text-zinc-200">{ex.rewritten}</div>
                <button
                  onClick={() => removeExample(i)}
                  className="text-red-400 text-xs mt-2 hover:text-red-300"
                >
                  Remove
                </button>
              </div>
            ))}
          </div>
          <div className="mt-3 space-y-2 bg-zinc-800/50 rounded p-3">
            <input
              type="text"
              value={newExample.original}
              onChange={(e) => setNewExample({ ...newExample, original: e.target.value })}
              placeholder="Original tweet..."
              className="w-full bg-zinc-800 border border-zinc-700 rounded px-3 py-1.5 text-sm text-zinc-200 focus:outline-none focus:border-blue-500"
            />
            <input
              type="text"
              value={newExample.rewritten}
              onChange={(e) => setNewExample({ ...newExample, rewritten: e.target.value })}
              placeholder="Rewritten tweet..."
              className="w-full bg-zinc-800 border border-zinc-700 rounded px-3 py-1.5 text-sm text-zinc-200 focus:outline-none focus:border-blue-500"
            />
            <button
              onClick={addExample}
              className="px-3 py-1 text-xs font-medium rounded bg-zinc-700 text-zinc-300 hover:bg-zinc-600 transition-colors"
            >
              Add Example
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
