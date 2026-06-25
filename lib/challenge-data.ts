export type TaskType = 'multiple_choice' | 'free_text' | 'external_lookup'
export type TaskCategory = 'network' | 'email' | 'osint' | 'files' | 'response' | 'threat_intel'
export type TaskStage = 1 | 2 | 3

export interface Task {
  id: string
  stage: TaskStage
  title: string
  category: TaskCategory
  categoryLabel: string
  categoryIcon: string
  points: number
  type: TaskType
  description: string
  evidence: { label: string; rows: { cols: string[]; highlight?: boolean }[] } | null
  hints: string[]
  resource?: { label: string; url: string }
  options?: string[]
  answer?: string
  answerGuidance?: string
}

export const SCENARIO = {
  title: 'Operation: Dark Harbour',
  briefing: `HarbourTech Ltd — a UK logistics firm — has triggered automated alerts overnight.\nYou are the on-call SOC team. Divide tasks between your team, investigate the evidence feeds, and work together to contain the incident.\nStage 2 unlocks when 2 Stage 1 tasks are complete. Stage 3 unlocks when 3 Stage 2 tasks are complete.`,
  duration: 20,
}

export const TASKS: Task[] = [
  {
    id: 'task-1',
    stage: 1,
    title: 'Identify the Attack Source',
    category: 'network',
    categoryLabel: 'Network Forensics',
    categoryIcon: '🌐',
    points: 15,
    type: 'multiple_choice',
    description: `The overnight monitoring system has flagged repeated authentication failures from an external IP address.\n\nReview the firewall log entries below and identify the suspicious external IP that made multiple failed login attempts before eventually succeeding.`,
    evidence: {
      label: 'Firewall Log — harbourtech-fw01',
      rows: [
        { cols: ['02:12:33', 'WARN',  '185.220.101.47', '→ 10.0.1.15:443', 'Failed login — user: sarah.chen'],  highlight: true },
        { cols: ['02:12:41', 'WARN',  '185.220.101.47', '→ 10.0.1.15:443', 'Failed login — user: sarah.chen'],  highlight: true },
        { cols: ['02:12:55', 'WARN',  '185.220.101.47', '→ 10.0.1.15:443', 'Failed login — user: sarah.chen'],  highlight: true },
        { cols: ['02:13:02', 'ALERT', '185.220.101.47', '→ 10.0.1.15:443', 'SUCCESS login — user: sarah.chen'], highlight: true },
        { cols: ['02:15:18', 'INFO',  '10.0.1.15',      '→ fileserver01',  'SMB share access — finance'],       highlight: false },
        { cols: ['02:38:41', 'ALERT', '10.0.1.15',      '→ 91.108.4.200',  'LARGE OUTBOUND: 847 MB — FLAGGED'], highlight: false },
      ],
    },
    hints: [
      'Look for WARN and ALERT level entries — these flag authentication failures and suspicious events.',
      'The attacker is connecting from outside the network. Internal IPs start with 192.168.x.x or 10.0.x.x.',
      'Filter by the username sarah.chen — which external IP is repeatedly attempting to log in as her?',
    ],
    options: ['192.168.1.54', '185.220.101.47', '91.108.4.200', '8.8.8.8'],
    answer: '185.220.101.47',
  },
  {
    id: 'task-2',
    stage: 1,
    title: 'Spot the Phishing Email',
    category: 'email',
    categoryLabel: 'Email Analysis',
    categoryIcon: '📧',
    points: 15,
    type: 'multiple_choice',
    description: `An email chain involving sarah.chen has been intercepted overnight. One of these emails is a phishing attempt designed to steal her login credentials.\n\nReview the email headers and body carefully. Identify the primary indicator that reveals this is a phishing attack.`,
    evidence: {
      label: 'Intercepted Email — sarah.chen@harbourtech.com',
      rows: [
        { cols: ['FROM',    'it-support@harbourtech-helpdesk.net'],                                    highlight: true  },
        { cols: ['TO',      'sarah.chen@harbourtech.com'],                                             highlight: false },
        { cols: ['SUBJECT', 'URGENT: Your account will be suspended in 24 hours'],                    highlight: false },
        { cols: ['TIME',    '2026-06-23 14:23:07'],                                                   highlight: false },
        { cols: ['BODY',    'Verify at: http://harbourtech-secure-login.net/verify?user=sarah.chen'], highlight: true  },
      ],
    },
    hints: [
      'Focus on the FROM address — compare the domain carefully with the real HarbourTech domain.',
      "HarbourTech's legitimate email domain is @harbourtech.com. What domain is this email actually from?",
      'harbourtech-helpdesk.net is a completely different domain to harbourtech.com — this is called domain spoofing.',
    ],
    options: [
      'The email was sent outside working hours',
      'The sender domain is harbourtech-helpdesk.net, not harbourtech.com',
      'The email contains a spelling mistake in the subject line',
      "The email was CC'd to too many recipients",
    ],
    answer: 'The sender domain is harbourtech-helpdesk.net, not harbourtech.com',
  },
  {
    id: 'task-3',
    stage: 1,
    title: 'Identify the Compromised Account',
    category: 'email',
    categoryLabel: 'Email Analysis',
    categoryIcon: '📧',
    points: 10,
    type: 'multiple_choice',
    description: `Following the phishing email, the attacker received a reply. Review the email thread and identify which employee's credentials were compromised.`,
    evidence: {
      label: 'Intercepted Reply — outbound from sarah.chen',
      rows: [
        { cols: ['FROM',    'sarah.chen@harbourtech.com'],                                              highlight: false },
        { cols: ['TO',      'it-support@harbourtech-helpdesk.net'],                                    highlight: true  },
        { cols: ['TIME',    '2026-06-23 14:41:52'],                                                   highlight: false },
        { cols: ['BODY',    '"I verified on the link. I used my usual password: Ch3rryBl0ss0m!"'],     highlight: true  },
        { cols: ['ROLE',    'Finance Manager, HarbourTech Ltd'],                                       highlight: false },
      ],
    },
    hints: [
      "Read Sarah's reply carefully — she has included sensitive information in her response.",
      'Sarah replied directly to the phishing address with her actual password in plaintext.',
      "The compromised account belongs to the person who replied. Their username matches their email prefix.",
    ],
    options: ['j.harris', 'm.patel', 'sarah.chen', 'd.wright'],
    answer: 'sarah.chen',
  },
  {
    id: 'task-4',
    stage: 2,
    title: 'IP Reputation Check',
    category: 'osint',
    categoryLabel: 'OSINT',
    categoryIcon: '🔍',
    points: 20,
    type: 'external_lookup',
    description: `You have identified the attacker IP. Real SOC analysts always verify IPs against threat intelligence databases.\n\nUse AbuseIPDB to look up the IP. Record:\n1. What type of IP is it?\n2. What is its Abuse Confidence Score (%)?\n3. How many times has it been reported?\n\nThis is a live lookup against a real database.`,
    evidence: {
      label: 'Target IP from network logs',
      rows: [
        { cols: ['IP Address', '185.220.101.47'],                          highlight: true  },
        { cols: ['Source',     'Multiple failed logins at 02:12'],         highlight: false },
        { cols: ['Action',     'Successful login at 02:13:02'],            highlight: true  },
      ],
    },
    hints: [
      'Click "Open AbuseIPDB" below and enter 185.220.101.47 in the search box.',
      'Look for the Abuse Confidence Score — a high percentage means it is well-known to the security community as malicious.',
      'Check the ISP and Usage Type fields — a Tor exit node anonymises attacker traffic by routing it through multiple servers.',
    ],
    resource: { label: '🔗 Open AbuseIPDB', url: 'https://www.abuseipdb.com/check/185.220.101.47' },
    answerGuidance: 'Tor exit node, 100% confidence score, hundreds of reports. Tor anonymises attacker location.',
  },
  {
    id: 'task-5',
    stage: 2,
    title: 'Trace the Data Exfiltration',
    category: 'network',
    categoryLabel: 'Network Forensics',
    categoryIcon: '🌐',
    points: 15,
    type: 'multiple_choice',
    description: `The network logs show a massive 847MB outbound data transfer at 02:38. This is almost certainly the stolen data leaving the network.\n\nIdentify the destination and determine what type of service received the stolen data.`,
    evidence: {
      label: 'Firewall Log — outbound transfers',
      rows: [
        { cols: ['02:38:41', 'ALERT', 'SRC: 10.0.1.15', 'DST: 91.108.4.200:443', 'LARGE OUTBOUND: 847MB — FLAGGED'], highlight: true  },
        { cols: ['02:39:15', 'INFO',  'SRC: 10.0.1.15', 'DST: 91.108.4.200:443', 'Connection closed'],               highlight: false },
        { cols: ['IP INTEL', 'HIGH',  '91.108.4.200',   'Netherlands',            'Anonymous cloud storage, no KYC'], highlight: true  },
      ],
    },
    hints: [
      'Look at the ALERT entry — identify the destination IP of the 847MB transfer.',
      'The IP 91.108.4.200 is based in the Netherlands. What type of service is it?',
      'KYC means Know Your Customer. Services without it allow anonymous uploads — popular for stolen data.',
    ],
    options: [
      'A Tor anonymisation server in Romania',
      'Google public DNS infrastructure',
      'An anonymous cloud storage server with no identity verification',
      'An internal HarbourTech disaster recovery server',
    ],
    answer: 'An anonymous cloud storage server with no identity verification',
  },
  {
    id: 'task-6',
    stage: 2,
    title: 'Catalogue the Stolen Files',
    category: 'files',
    categoryLabel: 'File System Analysis',
    categoryIcon: '🗂️',
    points: 15,
    type: 'multiple_choice',
    description: `The file server audit logs record every file the attacker accessed and downloaded. Cataloguing stolen data is essential for assessing breach impact and regulatory reporting.\n\nReview all DOWNLOAD actions after 02:35 and determine what category of data was exfiltrated.`,
    evidence: {
      label: 'File Server Audit Log — DOWNLOAD events',
      rows: [
        { cols: ['02:36:55', 'DOWNLOAD', 'sarah.chen', '/finance/budget_2026_final.xlsx'],   highlight: true },
        { cols: ['02:37:04', 'DOWNLOAD', 'sarah.chen', '/hr/staff_payroll_Q1_2026.xlsx'],    highlight: true },
        { cols: ['02:37:12', 'DOWNLOAD', 'sarah.chen', '/hr/staff_payroll_Q2_2026.xlsx'],    highlight: true },
        { cols: ['02:37:29', 'DOWNLOAD', 'sarah.chen', '/legal/client_contracts_2026.zip'],  highlight: true },
        { cols: ['02:37:55', 'DOWNLOAD', 'sarah.chen', '/finance/invoice_archive_2025.zip'], highlight: true },
        { cols: ['02:38:11', 'DOWNLOAD', 'sarah.chen', '/exec/board_minutes_june2026.docx'], highlight: true },
      ],
    },
    hints: [
      'Look at the directory paths — /finance/, /hr/, /legal/ and /exec/ tell you the data type.',
      'payroll = HR data, budget/invoice = financial data, contracts = legal, board_minutes = executive.',
      'This type of breach would trigger GDPR reporting obligations within 72 hours.',
    ],
    options: [
      'Customer shipping manifests and operational route data',
      'Source code, API keys and software credentials',
      'Financial records, payroll data, legal contracts and board minutes',
      'Employee email archives and calendar exports',
    ],
    answer: 'Financial records, payroll data, legal contracts and board minutes',
  },
  {
    id: 'task-7',
    stage: 2,
    title: 'Reconstruct the Attack Timeline',
    category: 'network',
    categoryLabel: 'Network Forensics',
    categoryIcon: '🌐',
    points: 20,
    type: 'multiple_choice',
    description: `A key part of incident response is reconstructing exactly how and when the attack unfolded. This forms the basis of your incident report.\n\nUsing all the evidence, place these events in the correct chronological order.`,
    evidence: {
      label: 'Key timestamps across all evidence',
      rows: [
        { cols: ['14:23 (prev day)', 'EMAIL',   'Phishing email received by sarah.chen'],        highlight: false },
        { cols: ['14:41 (prev day)', 'EMAIL',   'sarah.chen replies with credentials'],           highlight: false },
        { cols: ['02:12–02:13',      'NETWORK', '3x failed logins, then success from 185.220.101.47'], highlight: false },
        { cols: ['02:15–02:17',      'FILES',   '6 sensitive files READ from server'],            highlight: false },
        { cols: ['02:36–02:38',      'FILES',   '6 files DOWNLOADED'],                           highlight: false },
        { cols: ['02:38:41',         'NETWORK', '847MB transferred to 91.108.4.200'],            highlight: false },
      ],
    },
    hints: [
      'Start with the phishing email — that initiated the entire attack chain.',
      "The attacker needed Sarah's credentials before they could attempt to log in.",
      'Correct sequence: bait → steal credentials → use credentials → take data → exfiltrate.',
    ],
    options: [
      'Phishing sent → Credentials stolen → Failed logins → Successful login → Files read → Files downloaded → Exfiltrated',
      'Failed logins → Phishing sent → Credentials stolen → Successful login → Files downloaded → Exfiltrated',
      'Successful login → Phishing sent → Credentials stolen → Files read → Failed logins → Exfiltrated',
      'Phishing sent → Failed logins → Credentials stolen → Successful login → Exfiltrated → Files downloaded',
    ],
    answer: 'Phishing sent → Credentials stolen → Failed logins → Successful login → Files read → Files downloaded → Exfiltrated',
  },
  {
    id: 'task-8',
    stage: 3,
    title: 'Classify the Attack (MITRE ATT&CK)',
    category: 'threat_intel',
    categoryLabel: 'Threat Intelligence',
    categoryIcon: '🛡️',
    points: 20,
    type: 'multiple_choice',
    description: `SOC analysts use the MITRE ATT&CK framework to classify incidents. Open the link below, browse to the Phishing technique, and identify which sub-technique best matches this attack.`,
    evidence: null,
    hints: [
      'Open MITRE ATT&CK and look under the Initial Access tactic. The attacker gained access via a deceptive email.',
      'T1566 is the Phishing technique. Look at its sub-techniques.',
      'T1566.001 is Spearphishing Link — a targeted email with a malicious link to capture credentials. That is exactly what happened here.',
    ],
    resource: { label: '🔗 Open MITRE ATT&CK — Phishing', url: 'https://attack.mitre.org/techniques/T1566/' },
    options: [
      'T1190 — Exploit Public-Facing Application',
      'T1566.001 — Phishing: Spearphishing Link',
      'T1110.001 — Brute Force: Password Guessing',
      'T1078 — Valid Accounts (Insider Threat)',
    ],
    answer: 'T1566.001 — Phishing: Spearphishing Link',
  },
  {
    id: 'task-9',
    stage: 3,
    title: 'Immediate Response Plan',
    category: 'response',
    categoryLabel: 'Incident Response',
    categoryIcon: '🚨',
    points: 25,
    type: 'free_text',
    description: `The attack is confirmed. As SOC team lead, recommend the three most critical immediate containment actions.\n\nThink about:\n- The compromised account\n- The network connection to the exfiltration server\n- Evidence preservation\n- Regulatory obligations (UK GDPR)\n\nUse the NCSC guide as a reference.`,
    evidence: null,
    hints: [
      'First priority: stop the bleeding. What account is still accessible to the attacker?',
      'Consider: disable the account, block the exfil IP at the firewall, preserve log files for forensics.',
      'Under UK GDPR, personal data breaches must be reported to the ICO within 72 hours. Payroll data is personal data.',
    ],
    resource: { label: '🔗 NCSC — Incident Response Guide', url: 'https://www.ncsc.gov.uk/collection/incident-management' },
    answerGuidance: '1. Disable sarah.chen account immediately. 2. Block 91.108.4.200 at perimeter firewall. 3. Preserve all logs and initiate GDPR breach notification (72hr ICO deadline).',
  },
]

export const STAGE_UNLOCK_REQUIREMENTS: Record<2 | 3, number> = {
  2: 2,
  3: 3,
}
