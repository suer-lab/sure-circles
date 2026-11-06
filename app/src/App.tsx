import { useEffect, useRef, useState } from "react";
import { CIRCLE_SIZE, config, configError } from "./config";
import { useI18n } from "./i18n";
import { NEW_BUG_REPORT_URL } from "./lib/links";
import { usePoliteLiveRegion } from "./usePoliteLiveRegion";
import { ArtifactProgress } from "./components/ArtifactProgress.js";
import { ClaimSection } from "./components/ClaimSection.js";
import { FundingList, FundingListSkeleton } from "./components/FundingList.js";
import { Landing, LocaleSelect, NetworkBanner } from "./components/Landing.js";
import { MemberRing, MemberRingSkeleton } from "./components/MemberRing.js";
import { ResultCard } from "./components/ResultCard.js";
import { Stepper } from "./components/Stepper.js";
import { explorerContract } from "./lib/explorer";
import { ConnectionStatus } from "./components/ConnectionStatus";
import { useOnlineStatus } from "./hooks/useOnlineStatus";
import { useCircleFlow } from "./hooks/useCircleFlow";
import { copyDebugBundle, type BundleInput } from "./lib/debugBundle";

const APP_VERSION: string =
  (typeof import.meta.env.VITE_APP_VERSION === "string"
    ? import.meta.env.VITE_APP_VERSION
    : undefined) ?? "dev";

const BUG_REPORT_URL = NEW_BUG_REPORT_URL;

function EnvSetupScreen({ errors }: { errors: string[] }) {
  const { t } = useI18n();
  return (
    <div className="page">
      <div className="card hero">
        <LocaleSelect className="language-switcher-hero" />
        <h1>SURE CIRCLES</h1>
        <h2 style={{ color: "var(--color-error, #e55)" }}>{t("env.setupRequired")}</h2>
        <p className="sub">
          {t("env.setupIntro")} {t("env.setupHowTo")}
        </p>
        <ul style={{ textAlign: "left", margin: "1rem 0", padding: "0 1.25rem" }}>
          {errors.map((err) => (
            <li key={err} style={{ marginBottom: "0.5rem" }}>
              <code>{err}</code>
            </li>
          ))}
        </ul>
        <p className="fineprint">{t("env.setupDetails")}</p>
      </div>
    </div>
  );
}

function LiveRegion({ message }: { message: string }) {
  return (
    <div
      aria-live="polite"
      aria-atomic="true"
      className="sr-only"
      style={{
        position: "absolute",
        width: 1,
        height: 1,
        overflow: "hidden",
        clip: "rect(0,0,0,0)",
      }}
    >
      {message}
    </div>
  );
}

function CopyDebugBundleButton({
  circleId,
  round,
  currentStep,
  lastError,
  fundedCount,
  pot,
}: {
  circleId: bigint | null;
  round: number;
  currentStep: string | null;
  lastError: string | null;
  fundedCount: number;
  pot: bigint;
}) {
  const [status, setStatus] = useState<"idle" | "copied" | "fallback" | "error">("idle");

  useEffect(() => {
    if (status === "idle") return;
    const timer = setTimeout(() => setStatus("idle"), 2500);
    return () => clearTimeout(timer);
  }, [status]);

  async function handleClick() {
    const input: BundleInput = {
      appVersion: APP_VERSION,
      network: {
        contractId: config.contractId,
        rpcUrl: config.rpcUrl,
        networkPassphrase: config.networkPassphrase,
        tokenContractId: config.testTokenContractId,
      },
      circleId,
      round,
      currentStep,
      lastError,
      fundedCount,
      circleSize: CIRCLE_SIZE,
      pot,
      artifactHashes: {},
      timings: {},
      userAgent: navigator.userAgent,
    };

    const result = await copyDebugBundle(input);
    if (result.ok) {
      setStatus("copied");
    } else if (result.markdown) {
      window.prompt(
        "Clipboard unavailable. Select all and copy manually, then paste into your bug report:",
        result.markdown,
      );
      setStatus("fallback");
    } else {
      setStatus("error");
    }
  }

  const label =
    status === "copied"
      ? "✓ Copied!"
      : status === "fallback"
        ? "Opened prompt"
        : status === "error"
          ? "Error — retry?"
          : "📋 Copy debug bundle";

  return (
    <span className="debug-bundle-wrap">
      <button
        type="button"
        className="btn btn-ghost btn-small"
        onClick={handleClick}
        title="Copy a redacted debug snapshot to your clipboard, ready to paste into a bug report. No secret keys are included."
      >
        {label}
      </button>
      {(status === "copied" || status === "fallback") && (
        <a className="link fineprint" href={BUG_REPORT_URL} target="_blank" rel="noreferrer">
          open bug report ↗
        </a>
      )}
    </span>
  );
}

export default function App() {
  const { t } = useI18n();
  const online = useOnlineStatus();
  const flow = useCircleFlow();
  const { announce, message: liveRegionMessage } = usePoliteLiveRegion(120);

  const circleHeadingRef = useRef<HTMLHeadingElement>(null);
  const claimHeadingRef = useRef<HTMLHeadingElement>(null);
  const payoutHeadingRef = useRef<HTMLHeadingElement>(null);

  useEffect(() => {
    if (flow.screen === "circle") circleHeadingRef.current?.focus();
  }, [flow.screen]);

  useEffect(() => {
    if (flow.fullyFunded && !flow.claimResult) claimHeadingRef.current?.focus();
  }, [flow.fullyFunded, flow.claimResult]);

  useEffect(() => {
    if (flow.claimResult) payoutHeadingRef.current?.focus();
  }, [flow.claimResult]);

  useEffect(() => {
    if (flow.busy) {
      announce(t("liveRegion.help", { message: flow.busy }));
      return;
    }
    if (flow.circlePhase === "loading") {
      announce("Loading circle data…");
      return;
    }
    if (flow.claimResult) {
      announce(t("liveRegion.claimResultReady"));
      return;
    }
    if (flow.error) {
      announce(t("liveRegion.error", { message: flow.error }));
      return;
    }
    if (flow.fullyFunded) announce(t("liveRegion.claimStepReady"));
  }, [announce, flow.busy, flow.circlePhase, flow.claimResult, flow.error, flow.fullyFunded, t]);

  if (configError.length > 0) {
    return <EnvSetupScreen errors={configError} />;
  }

  if (flow.screen === "landing") {
    return (
      <Landing
        busy={flow.busy}
        error={flow.error}
        online={online}
        previousCircleId={flow.previousCircleId}
        onLaunch={flow.startCircle}
      />
    );
  }

  // Honest step derivation from the supported hook state: the circle exists
  // (step 1: fund), is fully funded (step 2: prove & claim), or has paid out (step 3).
  const step: 0 | 1 | 2 | 3 = flow.claimResult ? 3 : flow.fullyFunded ? 2 : 1;

  return (
    <div className="page">
      <NetworkBanner />
      <div className="card">
        <LocaleSelect />
        <LiveRegion message={liveRegionMessage} />
        <ArtifactProgress announce={announce} />
        {!online && (
          <div className="offline-banner" role="status">
            You are offline. Network actions are paused — reconnect to fund, claim, or retry.
          </div>
        )}
        <div className="row space-between">
          <h1 className="small" ref={circleHeadingRef} tabIndex={-1}>
            SURE_CIRCLES
          </h1>
          <div className="row">
            <ConnectionStatus online={online} />
            <a className="link" href={explorerContract()} target="_blank" rel="noreferrer">
              {t("circle.onChainLink", { id: flow.circleId?.toString() ?? "" })}
            </a>
            <button
              className="btn btn-small"
              disabled={!!flow.busy}
              onClick={flow.resetToLanding}
              title={`Start over. Your current circle (#${flow.circleId?.toString()}) keeps living on-chain.`}
            >
              {t("common.startNewCircle")}
            </button>
          </div>
        </div>

        <Stepper step={step} />

        {flow.circlePhase === "loading" ? (
          <>
            <MemberRingSkeleton />
            <div className="pot-bar-wrap" aria-hidden="true">
              <div className="skeleton skeleton-bar" />
            </div>
            <p className="pot-label" aria-hidden="true">
              <span className="skeleton skeleton-label" />
            </p>
            <FundingListSkeleton />
          </>
        ) : (
          <>
            <MemberRing members={flow.members} revealed={!!flow.claimResult} />

            <div className="pot-bar-wrap">
              <div
                className="pot-bar"
                style={{ width: `${(flow.fundedCount / CIRCLE_SIZE) * 100}%` }}
              />
            </div>
            <p className="pot-label">
              pot: {(Number(flow.pot) / 1e7).toFixed(1)} / {flow.contributionXlm * CIRCLE_SIZE} XLM
              · round {flow.round}
            </p>

            <FundingList
              members={flow.members}
              busy={flow.busy}
              round={flow.round}
              contributionXlm={flow.contributionXlm}
              online={online}
              onFund={flow.fundMember}
            />
          </>
        )}

        {flow.fullyFunded && !flow.claimResult && (
          <ClaimSection
            members={flow.members}
            claimantIndex={flow.claimantIndex}
            onSelectClaimant={flow.setClaimantIndex}
            busy={flow.busy}
            online={online}
            onClaim={flow.doClaim}
            headingRef={claimHeadingRef}
          />
        )}

        {flow.claimResult && (
          <ResultCard
            claimResult={flow.claimResult}
            rejection={flow.rejection}
            busy={flow.busy}
            circleId={flow.circleId}
            online={online}
            onClaimAgain={flow.claimAgain}
            onReset={flow.resetToLanding}
            headingRef={payoutHeadingRef}
          />
        )}

        {flow.error && <p className="error">{flow.error}</p>}

        <div className="debug-bundle-footer">
          <CopyDebugBundleButton
            circleId={flow.circleId}
            round={flow.round}
            currentStep={flow.busy}
            lastError={flow.error}
            fundedCount={flow.fundedCount}
            pot={flow.pot}
          />
        </div>
      </div>
    </div>
  );
}
