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
  answer?: string          // MC answer
  answerGuidance?: string  // Free text — shown on admin
}

export const SCENARIO = {
  title: 'Operation: Dark Harbour',
  briefing: `HarbourTech Ltd — a UK logistics firm — has triggered automated alerts overnight.
You are the on-call SOC team. Divide tasks between your team, investigate the evidence feeds, and work together to contain the incident.
Stage 2 unlocks when 2 Stage 1 tasks are complete. Stage 3 unlocks when 3 Stage 2 tasks are complete.`,
  duration: 20, // minutes
}

export const TASKS: Task[] = [

  // ── STAGE 1: INITIAL TRIAGE ─────────────────────────────────────────────────

  {
    id: 'task-1',
    stage: 1,
    title: 'Identify the Attack Source',
    category: 'network',
    categoryLabel: 'Network Forensics',
    categoryIcon: '🌐',
    points: 15,
    type: 'multiple_choice',
    description: `The overnight monitoring system has flagged repeated authentication failures from an external IP address.

Review the firewall log entries below and identify the suspicious external IP that made multiple failed login attempts before eventually succeeding.`,
    evidence: {
      label: 'Firewall Log — harbourtech-fw01',
      rows: [
        { cols: ['02:12:33', 'WARN',  '185.220.101.47', '→ 10.0.1.15:443', 'Failed login — user: sarah.chen'],     highlight: true },
        { cols: ['02:12:41', 'WARN',  '185.220.101.47', '→ 10.0.1.15:443', 'Failed login — user: sarah.chen'],     highlight: true },
        { cols: ['02:12:55', 'WARN',  '185.220.101.47', '→ 10.0.1.15:443', 'Failed login — user: sarah.chen'],     highlight: true },
        { cols: ['02:13:02', 'ALERT', '185.220.101.47', '→ 10.0.1.15:443', 'SUCCESS login — user: sarah.chen'],    highlight: true },
        { cols: ['02:15:18', 'INFO',  '10.0.1.15',      '→ fileserver01',  'SMB share access — \\finance'],        highlight: false },
        { cols: ['02:38:41', 'ALERT', '10.0.1.15',      '→ 91.108.4.200',  'LARGE OUTBOUND TRANSFER: 847 MB'],     highlight: false },
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
    description: `An email chain involving sarah.chen has been intercepted overnight. One of these emails is a phishing attempt designed to steal her login credentials.

Review the email headers and body carefully. Identify the primary indicator that reveals this is a phishing attack rather than a legitimate message.`,
    evidence: {
      label: 'Intercepted Email — sarah.chen@harbourtech.com',
      rows: [
        { cols: ['FROM',    'it-support@harbourtech-helpdesk.net'],                    highlight: true  },
        { cols: ['TO',      'sarah.chen@harbourtech.com'],                             highlight: false },
        { cols: ['SUBJECT', 'URGENT: Your account will be suspended in 24 hours'],    highlight: false },
        { cols: ['TIME',    '2026-06-23 14:23:07'],                                   highlight: false },
        { cols: ['BODY',    'Please verify your credentials at: http://harbourtech-secure-login.net/verify'], highlight: true },
      ],
    },
    hints: [
      'Focus on the FROM address — compare the domain carefully with the real HarbourTech domain.',
      'HarbourTech\'s legitimate email domain is @harbourtech.com. What domain is this email actually from?',
      'harbourtech-helpdesk.net is a completely different domain to harbourtech.com — owned by someone else. This is called domain spoofing.',
    ],
    options: [
      'The email was sent outside working hours',
      'The sender domain is harbourtech-helpdesk.net, not harbourtech.com',
      'The email contains a spelling mistake in the subject line',
      'The email was CC\'d to too many recipients',
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
    description: `Following on from the phishing email, the attacker received a reply. Review the email thread and identify exactly what credentials were compromised and who sent them.

This will be critical for your Stage 2 investigation.`,
    evidence: {
      label: 'Intercepted Reply — outbound from sarah.chen',
      rows: [
        { cols: ['FROM',    'sarah.chen@harbourtech.com'],                              highlight: false },
        { cols: ['TO',      'it-support@harbourtech-helpdesk.net'],                    highlight: true  },
        { cols: ['TIME',    '2026-06-23 14:41:52'],                                   highlight: false },
        { cols: ['BODY',    '"I\'ve verified on the link. I used my usual password: Ch3rryBl0ss0m!"'], highlight: true },
        { cols: ['ROLE',    'Finance Manager, HarbourTech Ltd'],                       highlight: false },
      ],
    },
    hints: [
      'Read Sarah\'s reply carefully — she has included sensitive information in her response.',
      'Sarah replied directly to the phishing address with her actual password in plaintext.',
      'The compromised account belongs to the person who replied. Their username will match their email prefix.',
    ],
    options: ['j.harris', 'm.patel', 'sarah.chen', 'd.wright'],
    answer: 'sarah.chen',
  },

  // ── STAGE 2: DEEP INVESTIGATION ─────────────────────────────────────────────

  {
    id: 'task-4',
    stage: 2,
    title: 'IP Reputation Check',
    category: 'osint',
    categoryLabel: 'OSINT',
    categoryIcon: '🔍',
    points: 20,
    type: 'external_lookup',
    description: `You've identified the attacker's IP address. Real SOC analysts always verify IPs against threat intelligence databases before escalating.

Use AbuseIPDB — an industry-standard threat intelligence platform — to look up the IP. Record:
1. What type of IP is it?
2. What is its Abuse Confidence Score (%)?
3. How many times has it been reported?

This is a real lookup against a live database.`,
    evidence: {
      label: 'Target IP from network logs',
      rows: [
        { cols: ['IP Address', '185.220.101.47'],                            highlight: true  },
        { cols: ['Source',     'Multiple failed login attempts at 02:12'],   highlight: false },
        { cols: ['Action',     'Successful login at 02:13:02'],              highlight: true  },
      ],
    },
    hints: [
      'Click "Open AbuseIPDB" below and enter 185.220.101.47 in the search box.',
      'Look for the Abuse Confidence Score — a high percentage means it\'s well-known to the security community as malicious.',
      'Check the "ISP" and "Usage Type" fields — they tell you what kind of IP this is. A Tor exit node anonymises attacker traffic.',
    ],
    resource: { label: '🔗 Open AbuseIPDB', url: 'https://www.abuseipdb.com/check/185.220.101.47' },
    answerGuidance: 'Tor exit node, 100% confidence score, hundreds of reports. Tor is used to anonymise attacker location.',
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
    description: `The network logs show a massive 847MB outbound data transfer at 02:38 — this is almost certainly the stolen data leaving the network.

Identify the destination IP and determine what type of service it is. This tells you where the data was sent and may help with recovery.`,
    evidence: {
      label: 'Firewall Log — outbound transfers',
      rows: [
        { cols: ['02:38:41', 'ALERT', 'SRC: 10.0.1.15', 'DST: 91.108.4.200:443', 'LARGE OUTBOUND: 847MB — FLAGGED'], highlight: true },
        { cols: ['02:39:15', 'INFO',  'SRC: 10.0.1.15', 'DST: 91.108.4.200:443', 'Connection closed'],               highlight: false },
        { cols: ['IP INTEL', 'HIGH',  '91.108.4.200',   'Netherlands',            'Anonymous cloud storage, no KYC'],  highlight: true },
      ],
    },
    hints: [
      'Look at the ALERT entry in the firewall log — identify the destination IP of the 847MB transfer.',
      'The IP 91.108.4.200 is based in the Netherlands. Check the IP Intelligence panel for details on what service it is.',
      'KYC means "Know Your Customer" — services without it allow anonymous uploads, making them popular for stolen data.',
    ],
    options: [
      'A Tor anonymisation server in Romania',
      'Google\'s public DNS infrastructure',
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
    categoryLabel: 'File System Analysi