import React, { useState, useEffect } from "react";
import {
  Search,
  Loader2,
  AlertCircle,
  User,
  ChevronRight,
  CheckCircle2,
  Ban,
  ExternalLink,
  Calendar,
} from "lucide-react";

// Types for the API responses
interface IdentityResponse {
  did: string;
  handle: string;
  pds: string;
  signing_key: string;
  error?: string;
}

interface ProfileRecord {
  cid: string;
  uri: string;
  value: {
    $type: string;
    avatar?: {
      ref: { $link: string };
      mimeType: string;
    };
    banner?: {
      ref: { $link: string };
      mimeType: string;
    };
    description?: string;
    displayName?: string;
    pronouns?: string;
    website?: string;
  };
}

interface BlockRecord {
  did: string;
  collection: string;
  rkey: string;
}

interface ActorData {
  identity: IdentityResponse;
  profile?: ProfileRecord;
}

interface EnrichedBlockRecord extends BlockRecord {
  actor?: ActorData;
  createdAt?: string; // Added createdAt field
}

interface BlockResponse {
  total: number;
  records: BlockRecord[];
  cursor?: string | null;
}

// Helper to construct CDN URLs (standard Bsky pattern)
const getCdnUrl = (did: string, cid: string, type: "avatar" | "banner") => {
  return `https://cdn.bsky.app/img/${type}/plain/${did}/${cid}@jpeg`;
};

/**
 * DRY logic to fetch identity and profile for any given identifier
 */
async function fetchActorData(identifier: string): Promise<ActorData> {
  let identity: IdentityResponse;
  const isDid = identifier.startsWith("did:");

  try {
    const resolveRes = await fetch(
      `https://slingshot.microcosm.blue/xrpc/com.bad-example.identity.resolveMiniDoc?identifier=${encodeURIComponent(
        identifier
      )}`
    );
    if (!resolveRes.ok) throw new Error("Identity resolution failed");
    identity = await resolveRes.json();
  } catch (err) {
    if (isDid) {
      identity = {
        did: identifier,
        handle: "handle.invalid",
        pds: "",
        signing_key: "",
      };
    } else {
      throw err;
    }
  }

  let profile: ProfileRecord | undefined;
  try {
    const profileRes = await fetch(
      `https://slingshot.microcosm.blue/xrpc/com.bad-example.repo.getUriRecord?at_uri=at://${identity.did}/app.bsky.actor.profile/self`
    );
    if (profileRes.ok) {
      profile = await profileRes.json();
    }
  } catch (e) {
    console.error(`Failed to fetch profile for ${identity.did}`, e);
  }

  return { identity, profile };
}

export default function App() {
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [targetActor, setTargetActor] = useState<ActorData | null>(null);

  // Block Analysis State
  const [blockers, setBlockers] = useState<EnrichedBlockRecord[]>([]);
  const [totalBlockers, setTotalBlockers] = useState<number>(0);

  const [stars, setStars] = useState<
    { top: string; left: string; size: string; opacity: number }[]
  >([]);

  useEffect(() => {
    const newStars = Array.from({ length: 50 }).map(() => ({
      top: `${Math.random() * 100}%`,
      left: `${Math.random() * 100}%`,
      size: `${Math.random() * 2 + 1}px`,
      opacity: Math.random() * 0.7 + 0.3,
    }));
    setStars(newStars);
  }, []);

  const handleResolve = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!input.trim() || loading) return;

    setLoading(true);
    setError(null);
    setTargetActor(null);
    setBlockers([]);
    setTotalBlockers(0);

    try {
      const actor = await fetchActorData(input.trim());
      // 1. Fetch the list of blocks from Constellation
      const blockRes = await fetch(
        `https://constellation.microcosm.blue/xrpc/blue.microcosm.links.getBacklinks?subject=${encodeURIComponent(
          actor.identity.did
        )}&source=app.bsky.graph.block:subject&limit=100`
      );

      const blockData: BlockResponse = await blockRes.json();

      // 2. Enrich records: Fetch Actor Profile + Fetch Block Record Details (for createdAt)
      const enrichedRecords = await Promise.all(
        blockData.records.map(async (record) => {
          try {
            // Parallelize the fetch for actor data and the specific block record
            const [blockerActor, recordDetailRes] = await Promise.all([
              fetchActorData(record.did),
              fetch(
                `https://slingshot.microcosm.blue/xrpc/com.bad-example.repo.getUriRecord?at_uri=at://${record.did}/${record.collection}/${record.rkey}`
              ),
            ]);

            let createdAt = undefined;
            if (recordDetailRes.ok) {
              const recordData = await recordDetailRes.json();
              // The 'value' field contains the actual record data including createdAt
              createdAt = recordData.value?.createdAt;
            }

            return { ...record, actor: blockerActor, createdAt };
          } catch (e) {
            return record;
          }
        })
      );

      setTargetActor(actor);
      setTotalBlockers(blockData.total);
      setBlockers(enrichedRecords);
    } catch (err: any) {
      setError(err.message || "An error occurred during lookup");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-slate-950 text-slate-200 font-sans selection:bg-indigo-500/30 relative antialiased">
      <div className="fixed inset-0 pointer-events-none">
        {stars.map((star, i) => (
          <div
            key={i}
            className="absolute bg-white rounded-full animate-pulse"
            style={{
              top: star.top,
              left: star.left,
              width: star.size,
              height: star.size,
              opacity: star.opacity,
              animationDuration: `${Math.random() * 3 + 2}s`,
            }}
          />
        ))}
      </div>

      <div className="relative z-10 max-w-2xl mx-auto px-4 py-8 flex flex-col items-center min-h-screen">
        <div className="text-center mb-8 space-y-2">
          <h1 className="text-4xl font-mono tracking-tighter text-transparent bg-clip-text bg-gradient-to-r from-indigo-300 via-purple-300 to-indigo-300 drop-shadow-[0_0_15px_rgba(129,140,248,0.3)]">
            darkstar
          </h1>
          <p className="text-slate-400 text-sm">
            see who blocks a user on bluesky using constellation
          </p>
        </div>

        <div className="w-full max-w-lg mb-10">
          <form onSubmit={handleResolve} className="relative group">
            {/* Background Glow */}
            <div className="absolute inset-0 bg-gradient-to-r from-indigo-500 to-purple-600 rounded-xl blur opacity-20 group-hover:opacity-40 transition duration-500 pointer-events-none" />

            {/* Input Container using :has logic via Tailwind arbitrary variants */}
            <div className="relative flex items-center bg-slate-900/90 backdrop-blur-xl border border-slate-700/50 rounded-xl p-1.5 transition-all duration-300 [&:has(input:focus)]:ring-2 [&:has(input:focus)]:ring-indigo-500/40 [&:has(input:focus)]:border-indigo-500/50">
              <Search className="ml-3.5 w-5 h-5 text-slate-500 flex-shrink-0" />
              <input
                type="text"
                value={input}
                onChange={(e) => setInput((e.target as HTMLInputElement).value)}
                placeholder="Enter handle or DID"
                className="w-full bg-transparent border-none focus:outline-none focus:ring-0 text-slate-200 placeholder-slate-500 py-2.5 px-3.5"
              />
              <button
                type="submit"
                aria-disabled={loading || !input}
                aria-label={loading ? "Loading..." : "Load Blocks"}
                className={`flex items-center justify-center w-10 h-10 p-1 shrink-0 bg-indigo-600 hover:bg-indigo-500 text-white font-medium rounded-lg transition-all shadow-lg shadow-indigo-500/20 active:scale-95 ${
                  loading ? "cursor-default opacity-80" : ""
                }`}
              >
                {loading ? (
                  <Loader2 className="w-5 h-5 animate-spin" />
                ) : (
                  <ChevronRight className="w-5 h-5" />
                )}
              </button>
            </div>
          </form>
          {error && (
            <div className="mt-4 p-4 bg-red-950/30 border border-red-500/20 rounded-lg flex items-center gap-3 text-red-300 animate-in fade-in slide-in-from-top-2">
              <AlertCircle className="w-5 h-5 flex-shrink-0" />
              <p className="text-sm">{error}</p>
            </div>
          )}
        </div>

        {targetActor && (
          <div className="w-full animate-in fade-in slide-in-from-bottom-4 duration-500 space-y-6 pb-20">
            {/* Target Identity Card */}
            <div className="bg-slate-900/60 backdrop-blur-md border border-slate-700/50 rounded-2xl overflow-hidden shadow-2xl relative">
              <div className="bg-slate-800 absolute inset-0 overflow-hidden z-0">
                {targetActor.profile?.value?.banner ? (
                  <div
                    style={{
                      backgroundImage: `url(${getCdnUrl(
                        targetActor.identity.did,
                        targetActor.profile.value.banner.ref.$link,
                        "banner"
                      )})`,
                      inset: "0 -1rem 0 0",
                      position: "absolute",
                      backgroundSize: "cover",
                      backgroundPosition: "center",
                    }}
                  />
                ) : (
                  <div className="w-full h-full bg-gradient-to-br from-indigo-900/40 via-slate-900 to-purple-900/40 opacity-50" />
                )}
                <div className="absolute inset-0 bg-gradient-to-t from-slate-900/100 via-slate-900/90 to-slate-900/70" />
              </div>

              <div className="px-6 py-5 relative z-1">
                <div className="mb-3 flex items-end gap-2 relative">
                  <div className="w-12 h-12 rounded-xl border border-slate-900 bg-slate-800 overflow-hidden relative shadow-xl flex-shrink-0">
                    {targetActor.profile?.value?.avatar ? (
                      <img
                        src={getCdnUrl(
                          targetActor.identity.did,
                          targetActor.profile.value.avatar.ref.$link,
                          "avatar"
                        )}
                        alt=""
                        className="w-full h-full object-cover"
                      />
                    ) : (
                      <div className="w-full h-full flex items-center justify-center bg-slate-700 text-slate-500">
                        <User className="w-8 h-8" />
                      </div>
                    )}
                  </div>
                  <div className="pb-1 overflow-hidden">
                    <h2 className="text-xl font-bold text-white leading-tight truncate">
                      {targetActor.profile?.value?.displayName ||
                        targetActor.identity.handle}
                    </h2>
                    <p className="text-slate-400 font-mono text-xs mt-0.5 truncate">
                      {targetActor.identity.handle === "handle.invalid"
                        ? targetActor.identity.did
                        : "@" + targetActor.identity.handle}
                    </p>
                  </div>
                </div>

                {targetActor.profile?.value?.description && (
                  <p className="text-slate-400 leading-snug max-w-2xl text-s line-clamp-2">
                    {targetActor.profile.value.description}
                  </p>
                )}
              </div>
            </div>

            {/* Block Analysis Section */}
            <div className="bg-slate-900/60 backdrop-blur-md border border-slate-700/50 rounded-2xl overflow-hidden shadow-2xl p-6">
              <div className="flex items-center justify-between mb-6">
                <div className="flex items-center gap-3">
                  <div className="p-2 bg-red-500/10 rounded-lg border border-red-500/20">
                    <Ban className="w-4 h-4 text-red-400" />
                  </div>
                  <div>
                    <h3 className="text-base leading-snug font-bold text-slate-200">
                      Blocked By
                    </h3>
                    <p className="text-[12px] leading-snug text-slate-500 font-mono uppercase">
                      {totalBlockers} found
                    </p>
                  </div>
                </div>
              </div>

              {blockers.length > 0 ? (
                <div className="space-y-3">
                  <div className="grid grid-cols-1 gap-2.5">
                    {blockers.map((blocker) => (
                      <a
                        href={`https://bsky.app/profile/${blocker.did}`}
                        target="_blank"
                        rel="noreferrer"
                        key={`${blocker.did}-${blocker.rkey}`}
                        className="group flex items-center justify-between p-3.5 bg-slate-950/40 border border-slate-800 hover:border-indigo-500/30 rounded-xl transition-all duration-200"
                      >
                        <div className="flex items-center gap-3.5 overflow-hidden">
                          <div className="w-9 h-9 rounded-lg bg-slate-800 flex items-center justify-center flex-shrink-0 border border-slate-700 group-hover:border-indigo-500/30 overflow-hidden shadow-inner">
                            {blocker.actor?.profile?.value?.avatar ? (
                              <img
                                src={getCdnUrl(
                                  blocker.did,
                                  blocker.actor.profile.value.avatar.ref.$link,
                                  "avatar"
                                )}
                                alt=""
                                className="w-full h-full object-cover"
                              />
                            ) : (
                              <User className="w-4 h-4 text-slate-600 group-hover:text-indigo-400 transition-colors" />
                            )}
                          </div>

                          <div className="overflow-hidden">
                            <p className="text-sm font-bold text-slate-200 truncate group-hover:text-white transition-colors">
                              {blocker.actor?.profile?.value?.displayName ||
                                blocker.actor?.identity?.handle ||
                                "..."}
                            </p>
                            <p className="text-[10px] font-mono text-slate-500 truncate group-hover:text-indigo-400/70 transition-colors">
                              {blocker.actor?.identity?.handle
                                ? `@${blocker.actor.identity.handle}`
                                : blocker.did}
                            </p>
                          </div>
                        </div>

                        <div className="flex items-center gap-3">
                          {/* Display Date if available */}
                          {blocker.createdAt && (
                            <div className="flex items-center gap-1.5 text-slate-600 group-hover:text-slate-400 transition-colors">
                              <Calendar className="w-3 h-3" />
                              <span className="text-[10px] font-mono uppercase">
                                {new Date(blocker.createdAt).toLocaleDateString(
                                  undefined,
                                  {
                                    year: "numeric",
                                    month: "short",
                                    day: "numeric",
                                  }
                                )}
                              </span>
                            </div>
                          )}
                          <span className="p-2 text-slate-600 group-hover:text-indigo-400 rounded-lg transition-all">
                            <ExternalLink className="w-4 h-4" />
                          </span>
                        </div>
                      </a>
                    ))}
                  </div>
                  {totalBlockers > 100 && (
                    <p className="text-[10px] text-center text-slate-600 italic mt-4 uppercase tracking-tighter">
                      Showing first 100 results from constellation
                    </p>
                  )}
                </div>
              ) : (
                <div className="text-center py-12 text-slate-600 border border-dashed border-slate-800 rounded-xl bg-slate-950/20">
                  <CheckCircle2 className="w-6 h-6 mx-auto mb-3 opacity-20" />
                  <p className="text-xs uppercase tracking-widest font-medium">
                    No blocks found
                  </p>
                </div>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
