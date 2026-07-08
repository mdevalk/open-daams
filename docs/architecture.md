# HDAB-NL DAAMS — Prototype architectuur

## Positie van dit project

Dit prototype implementeert de TEHDAS2 D6.4 state machine en de EHDS-workflow
zoals gedefinieerd door de Europese Commissie. Het is **geen** concurrent van de
officiële nationale DAAMS die VWS, RIVM, CBS, ICTU en Health-RI gezamenlijk
bouwen; het vervult een andere rol:

| Gebruik | Toelichting |
|---|---|
| **Referentie-implementatie** | Verifieerbare vertaling van D6.4 naar werkende code |
| **Datahouder-voorbereiding** | Ziekenhuizen, cohorten en registers kunnen de EHDS-workflow oefenen vóórdat de officiële DAAMS er is |
| **NCP-simulatie** | De HD@EU import-sectie bootst het NCP-kanaal na voor grensoverschrijdende aanvragen |
| **Leerplatform** | HDAB-NL medewerkers kunnen rollen en deadlines oefenen in een veilige omgeving |

---

## Componentdiagram (datahouder-voorbereiding)

```
┌─────────────────────────────────────────────────────────────────┐
│                        Datahouder                               │
│                                                                 │
│  ┌──────────────┐    ┌──────────────┐    ┌──────────────────┐  │
│  │  Applicant   │    │  HDAB-NL     │    │  Secure           │  │
│  │  portal      │───▶│  DAAMS       │───▶│  Processing       │  │
│  │  (Next.js)   │    │  (dit tool)  │    │  Environment (SPE)│  │
│  └──────────────┘    └──────┬───────┘    └──────────────────┘  │
│                             │                                   │
│                             │ NCP-kanaal (REST/FHIR)            │
│                             ▼                                   │
│                    ┌──────────────────┐                        │
│                    │  HD@EU Import    │ ◀── Buitenlands HDAB   │
│                    │  endpoint        │     (via NCP)          │
│                    └──────────────────┘                        │
└─────────────────────────────────────────────────────────────────┘
```

**Belangrijk (D6.4 §13):** DAAMS communiceert NOOIT rechtstreeks met het
HealthData@EU Central Platform. Alle grensoverschrijdende aanvragen lopen via
de Nationale Contactpersoon (NCP).

---

## Compliance-grenzen van dit prototype

| Vereiste | Status in prototype | Vereiste voor productie |
|---|---|---|
| **AVG / GDPR** | Geen echte persoonsgegevens — testdata only | Verwerkersovereenkomst, DPIA, register van verwerkingen |
| **NEN 7510 / ISO 27001** | Buiten scope | Volledig ISMS, gecertificeerde hosting |
| **EHDS Art. 53/67/68/69** | Workflow volgt D6.4; geen juridische geldigheid | Aanwijzing als HDAB door minister VWS |
| **WCAG 2.1 AA** | NL Design System tokens aanwezig; volledige audit vereist | Accessibility-audit door gecertificeerde partij |
| **Logging & audittrail** | AuditLog model aanwezig | Onveranderlijk logarchief (bijv. WORM-opslag) |
| **Sleutelbeheer** | `.env` bestand | HSM of KMS (bijv. Azure Key Vault) |

---

## State machine (TEHDAS2 D6.4 Figuren 1 & 2)

Beide aanvraagtypen (`DATA_ACCESS_APPLICATION` en `DATA_REQUEST`) gebruiken
dezelfde state machine:

```
DRAFT
  │
  ▼ [APPLICANT: indienen]
SUBMITTED
  │
  ▼ [CASE_HANDLER: pre-screening starten]
PRE_SCREENING ◀──────────────────────────────┐
  │                                          │
  ├─▶ [CASE_HANDLER] AWAITING_ADDITIONAL_   │
  │                  INFORMATION            │
  │                    │                    │
  │                    ├─▶ [APPLICANT /     │
  │                    │    CASE_HANDLER]   │
  │                    │    Info ingediend ─┘
  │                    │
  │                    └─▶ [DECISION_MAKER] DECISION_ISSUED (NEGATIEF)
  │                            (geen reactie binnen termijn)
  │
  ▼ [CASE_HANDLER: afronden]
PROCESSING
  │
  ├─▶ [DECISION_MAKER] DECISION_ISSUED (POSITIEF)
  │       │
  │       └─▶ DataPermit aanmaken (D6.4 §9.2)
  │               │
  │               ├─▶ GRANTED → AMENDED (nieuw permit-ID)
  │               ├─▶ GRANTED → RENEWED (nieuw permit-ID; kan niet nogmaals)
  │               ├─▶ GRANTED → REVOKED
  │               └─▶ GRANTED → EXPIRED
  │
  └─▶ [DECISION_MAKER] DECISION_ISSUED (NEGATIEF)

WITHDRAWN  ◀── elk actief stadium
```

### Deadlines (D6.4 §8)

- **Beslissingstermijn**: 2 maanden na `SUBMITTED` (4 maanden indien verlengd)
- **Opschorting**: deadline wordt `null` bij transitie naar `AWAITING_ADDITIONAL_INFORMATION`
- **Herberekening**: deadline herstart vanaf `additionalInfoReceivedAt` bij terugkeer naar `PRE_SCREENING`
- **Aanvullende informatie deadline**: 28 dagen vanaf verzoek

---

## Grensoverschrijdende aanvragen (HD@EU via NCP)

Aanvragen van buitenlandse onderzoekers komen via het NCP-kanaal binnen:

1. Buitenlands HDAB stuurt payload naar `/api/import/hdeu`
2. Deduplicatie op `hdeuApplicationId` (409 bij duplicaat)
3. Aanvraag wordt aangemaakt in status `SUBMITTED`
4. Wettelijke termijn start vanaf `transmissionTimestamp` in de payload
5. Verdere workflow identiek aan nationale aanvragen

Zie `docs/hdeu-payload-sample.json` voor een voorbeeldpayload (Finland → NL).

---

## Technische stack

| Laag | Technologie |
|---|---|
| Frontend | Next.js 15.3 (App Router), React 19, TypeScript |
| Styling | NL Design System (Rijkshuisstijl Community), Tailwind CSS |
| ORM | Prisma |
| Database | PostgreSQL |
| Authenticatie | Stub (userId via request body) — productie vereist DigiD/eHerkenning |

---

## Roadmap richting productie

1. **Authenticatie**: DigiD voor aanvragers, eHerkenning voor organisaties, SAML/OIDC voor HDAB-medewerkers
2. **Autorisatie**: RBAC op dossier-niveau (aanvrager ziet alleen eigen aanvragen)
3. **Notificaties**: e-mail/MijnOverheid bij statuswijziging
4. **DataPermit UI**: permit-detailpagina en transitiepaneel (API aanwezig, UI nog te bouwen)
5. **Documentbeheer**: bijlagen bij aanvraag (AVG-conforme opslag)
6. **Audittrail export**: voor toezichthouders (Autoriteit Persoonsgegevens)
7. **NCP-integratie**: formele aansluiting op het HealthData@EU NCP-netwerk
