export type Lang = 'en' | 'de';

const lang: Lang =
  typeof navigator !== 'undefined' && navigator.language?.toLowerCase().startsWith('de')
    ? 'de'
    : 'en';

const translations = {
  en: {
    common: {
      loading: 'Loading...',
      cancel: 'Cancel',
      save: 'Save',
      delete: 'Delete',
      confirm: 'Confirm',
      create: 'Create',
      logout: 'Logout',
      back: 'Back',
      yes: 'Yes',
      no: 'No',
    },
    landing: {
      badge: 'Interactive Python Classroom',
      headline_1: 'Learn Python.',
      headline_2: 'Try your ideas.',
      headline_3: 'Work with AI.',
      subtitle:
        'With PyLearn, you build small programs and see immediately what your code does. You learn how programming works \u2014 and how to work with AI without losing the thread.',
      student_title: "I'm a Student",
      student_name_placeholder: 'Your name',
      student_login_loading: 'Logging in...',
      student_login_btn: 'Enter Classroom',
      teacher_title: "I'm a Teacher",
      teacher_welcome: 'Welcome back, {{name}}!',
      teacher_go_dashboard: 'Go to Dashboard',
      teacher_local_hint: 'Click to sign in as the local teacher.',
      teacher_google_hint:
        'Sign in with your Google account to access the admin dashboard.',
      teacher_local_login: 'Log in',
      teacher_google_login: 'Sign In with Google',
      feature1_title: 'Browser-Based Editor',
      feature1_desc:
        'Code in Python, run text adventures, and build graphical games right in the browser.',
      feature2_title: 'Smart AI Assistant',
      feature2_desc:
        "Get help when you're stuck with visual code diffs that you can review and accept.",
      feature3_title: 'Live Teacher Help',
      feature3_desc:
        'Teachers can jump into your workspace and co-edit code in real-time to guide you.',
    },
    admin: {
      title: 'PyLearn Admin',
      teacher_label: 'Teacher',
      tab_overview: 'Overview',
      tab_students: 'Students',
      tab_programs: 'Programs',
      tab_prompts: 'Prompts',
      tab_cheatsheets: 'Cheat Sheets',
      tab_settings: 'AI Settings',
      tab_my_workspace: 'My Workspace',
      demo_title: 'Teacher Demo Workspace',
      demo_desc: 'Code Python just like your students. Assign programs to yourself for demos — the system treats you as a regular student.',
      demo_launch_btn: 'Open Demo Workspace',
      help_title: 'Active Help Requests',
      help_empty: 'No active requests. Good job!',
      help_join: 'Join Workspace',
      help_dismiss: 'Dismiss',
      roster_title: 'Class Roster',
      roster_view: 'View',
      roster_needs_help: 'Needs Help',
      roster_empty: 'No students yet.',
      students_title: 'Student Accounts',
      students_desc: 'Create and manage student PIN-based accounts',
      students_create_btn: 'Create Student',
      students_new_section: 'New Student',
      students_name_placeholder: 'Student name',
      students_creating: 'Creating...',
      students_pin_label: 'PIN:',
      students_account_created: 'Account Created!',
      students_pin_hint: 'Give this PIN to {{name}}:',
      students_pin_note: "The PIN is also always visible on the student's card below.",
      students_created_ago: 'Created {{time}} ago',
      students_paused: 'Paused',
      students_active: 'Active',
      students_resume: 'Resume',
      students_pause: 'Pause',
      students_delete_confirm:
        'Permanently delete this student and all their work?',
      students_empty: 'No student accounts yet',
      students_empty_desc:
        'Create accounts for your students so they can log in with a name and PIN.',
      students_create_first: 'Create First Student',
      credits_label: 'credits',
      credits_reset_title: 'Reset credits to 10',
      programs_title: 'Programs Library',
      programs_desc: 'Create programs and assign them to students',
      programs_load_demos: 'Load Demos',
      programs_loading: 'Loading...',
      programs_new: 'New Program',
      programs_empty: 'No programs yet',
      programs_empty_desc:
        'Create programs using the button above to build your library. Then assign them to students.',
      programs_assign: 'Assign',
      programs_no_students: 'No students yet',
      programs_uploaded_ago: 'Uploaded {{time}} ago',
      programs_dialog_title: 'New Program',
      programs_dialog_desc:
        'Give it a filename and write or paste your Python code.',
      programs_filename_label: 'Filename',
      programs_filename_placeholder: 'e.g. hello_world',
      programs_filename_hint: '.py will be added automatically if omitted',
      programs_code_label: 'Code',
      programs_saving: 'Saving...',
      programs_save: 'Save Program',
      prompts_title: 'Prompts Library',
      prompts_desc:
        'Create prompts and assign them to students for AI Chat mode',
      prompts_new: 'New Prompt',
      prompts_empty: 'No prompts yet',
      prompts_empty_desc:
        'Create prompts using the button above. Assign them to students to appear in their AI Chat sidebar.',
      prompts_dialog_title: 'New Prompt',
      prompts_dialog_desc:
        'Create a prompt template that can be assigned to students in AI Chat mode.',
      prompts_title_label: 'Title',
      prompts_title_placeholder: 'e.g. Explain how AI works',
      prompts_content_label: 'Prompt Content',
      prompts_content_placeholder:
        'Write the prompt text that will be sent to the AI...',
      prompts_saving: 'Saving...',
      prompts_save: 'Save Prompt',
      sheets_title: 'Cheat Sheets',
      sheets_desc: 'Active sheets appear as buttons in the student header',
      sheets_new: 'New Sheet',
      sheets_loading: 'Loading\u2026',
      sheets_empty: 'No cheat sheets yet. Click "New Sheet" to create one.',
      sheets_active: 'Active',
      sheets_hidden: 'Hidden',
      sheets_delete_confirm: 'Delete this cheat sheet?',
      sheets_edit_title: 'Edit Cheat Sheet',
      sheets_new_title: 'New Cheat Sheet',
      sheets_title_label: 'Title',
      sheets_order_label: 'Order',
      sheets_content_label: 'Content (Markdown)',
      ai_title: 'AI Configuration',
      ai_desc: "Control the assistant's behavior",
      ai_mode_label: 'Global AI Mode',
      ai_mode_off: 'OFF (Disabled)',
      ai_mode_suggestion: 'SUGGESTION (Hints & Explanations)',
      ai_mode_agent: 'AGENT (Code Changes + Diffs)',
      ai_mode_chat: 'CHAT (Full-Screen AI Chat)',
      ai_provider_label: 'Provider',
      ai_apikey_label: 'API Key (for {{provider}})',
      ai_apikey_placeholder: 'Enter API key...',
      ai_apikey_hint:
        'Enter key directly or use ENV:VAR_NAME to reference an environment variable. Leave blank to keep existing.',
      ai_prompt_suggest: 'System Prompt (Suggestion Mode)',
      ai_prompt_agent: 'System Prompt (Agent Mode)',
      ai_prompt_chat: 'System Prompt (Chat Mode)',
      ai_prompt_chat_hint:
        'This prompt is used when AI Chat mode is active. Set boundaries for age-appropriate conversations.',
      ai_prompt_off: 'System Prompt (Off Mode Message)',
      ai_save: 'Save Configuration',
      ai_saving: 'Saving...',
      ai_tab_suggest: 'Suggest',
      ai_tab_agent: 'Agent',
      ai_tab_chat: 'Chat',
      ai_tab_off: 'Off',
      lib_title: 'PyLearn Library Reference',
      lib_desc:
        'Auto-injected into every AI prompt \u00b7 edit pylearn-ref.ts to update',
      delete_confirm_label: 'Delete?',
    },
    workspace: {
      loading: 'Loading...',
      session_paused_title: 'Your session has been paused',
      session_ended_title: 'Your session has ended',
      session_paused_desc:
        'Your teacher has paused your access. Please raise your hand and wait for them.',
      session_ended_desc:
        'Your teacher has ended your session. Please speak to your teacher.',
      back_to_login: 'Back to login',
      mode_changed_title: 'Classroom mode changed',
      mode_changed_desc:
        'Your teacher has updated the classroom settings. Please log out and sign back in to continue.',
      output_label: 'Output',
      running: '\u25cf Running',
      hide_console: 'Hide console',
      show_console: 'Show console',
      present: 'Present',
      exit_present: 'Exit',
      console_empty_title: 'Console is empty',
      console_empty_desc:
        'When your code uses print(), the text appears here.',
      mode_chat: 'Chat Mode',
      mode_agent: 'Agent Mode',
      mode_suggest: 'Suggest Mode',
      teacher_viewing: 'Teacher is viewing',
      need_help: 'Need Help',
      source_code: 'Source Code',
      save: 'Save',
      stop: 'Stop',
      run: 'Run',
      exit_fullscreen: 'Exit full screen',
      fullscreen: 'Full screen',
    },
    admin_workspace: {
      back: 'Back',
      viewing: 'Viewing: {{name}}',
      co_edit: 'Co-Edit',
      files: 'Files',
      source_code: 'Source Code',
      output: 'Output',
      read_only: 'READ ONLY',
      terminal_label: 'Student Terminal (read-only)',
    },
    ai_panel: {
      title: 'AI Assistant',
      no_credits_badge: 'No credits',
      credits_one: '{{count}} credit',
      credits_other: '{{count}} credits',
      welcome: "Hello! I'm your AI coding assistant.",
      welcome_hint:
        'Ask me to explain code, find bugs, or suggest improvements.',
      no_credits_hint: 'No credits remaining \u2014 contact your teacher',
      placeholder: 'Ask a question...',
      placeholder_no_credits: 'No credits remaining',
      copy: 'Copy',
      copied: 'Copied',
    },
    ai_chat: {
      title: 'AI Chat',
      no_credits: 'No credits remaining',
      credits_one: '{{count}} credit remaining',
      credits_other: '{{count}} credits remaining',
      new_chat: 'New Chat',
      welcome: 'Hello! Ask me anything about AI.',
      welcome_hint:
        "I'm here to help you learn about artificial intelligence. Ask me questions, explore ideas, and discover how AI works!",
      no_credits_box:
        'No credits remaining. Contact your teacher for more credits.',
      placeholder: 'Ask a question...',
      placeholder_no_credits:
        'No credits remaining \u2014 contact your teacher',
      error_no_credits:
        'No credits remaining. Contact your teacher for more credits.',
    },
    sidebar: {
      files: 'Files',
      prompts: 'Prompts',
      create_file_title: 'Create New File',
      filename_placeholder: 'filename.py',
      creating: 'Creating\u2026',
      create_btn: 'Create',
      no_prompts: 'No prompts yet.',
      no_prompts_hint: 'Your teacher will assign prompts.',
      no_files: 'No files yet.',
      delete_title: 'Delete file',
      delete_cannot_undo: 'This cannot be undone.',
      delete_image_confirm: 'Delete {{filename}}?',
      images: 'Images',
      no_images: 'No images yet.',
      upload_success: 'Uploaded!',
      upload_success_desc: '{{filename}} is ready to use.',
      upload_fail: 'Upload failed',
      network_error: 'Network error',
      deleted: 'Deleted',
      deleted_desc: '{{filename}} removed.',
    },
    not_found: {
      title: '404 Page Not Found',
      hint: 'Did you forget to add the page to the router?',
    },
  },

  de: {
    common: {
      loading: 'L\u00e4dt\u2026',
      cancel: 'Abbrechen',
      save: 'Speichern',
      delete: 'L\u00f6schen',
      confirm: 'Best\u00e4tigen',
      create: 'Erstellen',
      logout: 'Abmelden',
      back: 'Zur\u00fcck',
      yes: 'Ja',
      no: 'Nein',
    },
    landing: {
      badge: 'Interaktiver Python-Unterricht',
      headline_1: 'Python lernen.',
      headline_2: 'Ideen ausprobieren.',
      headline_3: 'Mit KI arbeiten.',
      subtitle:
        'Mit PyLearn baust du eigene kleine Programme und siehst sofort, was dein Code bewirkt. Du lernst, wie Programmieren funktioniert \u2014 und wie du mit KI weiterkommst, ohne den \u00dcberblick zu verlieren.',
      student_title: 'Ich bin Sch\u00fcler',
      student_name_placeholder: 'Dein Name',
      student_login_loading: 'Anmelden\u2026',
      student_login_btn: 'Zum Unterricht',
      teacher_title: 'Ich bin Lehrer',
      teacher_welcome: 'Willkommen zur\u00fcck, {{name}}!',
      teacher_go_dashboard: 'Zum Dashboard',
      teacher_local_hint:
        'Klicken, um dich als lokaler Lehrer anzumelden.',
      teacher_google_hint:
        'Melde dich mit deinem Google-Konto an, um auf das Admin-Dashboard zuzugreifen.',
      teacher_local_login: 'Anmelden',
      teacher_google_login: 'Mit Google anmelden',
      feature1_title: 'Browser-basierter Editor',
      feature1_desc:
        'Python programmieren, Textabenteuer spielen und grafische Spiele direkt im Browser erstellen.',
      feature2_title: 'Intelligenter KI-Assistent',
      feature2_desc:
        'Hol dir Hilfe bei Problemen mit visuellen Code-Diffs, die du \u00fcberpr\u00fcfen und akzeptieren kannst.',
      feature3_title: 'Live-Lehrerunterst\u00fctzung',
      feature3_desc:
        'Lehrer k\u00f6nnen in deinen Arbeitsbereich springen und Code in Echtzeit mitbearbeiten.',
    },
    admin: {
      title: 'PyLearn Admin',
      teacher_label: 'Lehrer',
      tab_overview: '\u00dcbersicht',
      tab_students: 'Sch\u00fcler',
      tab_programs: 'Programme',
      tab_prompts: 'Prompts',
      tab_cheatsheets: 'Spickzettel',
      tab_settings: 'KI-Einstellungen',
      tab_my_workspace: 'Mein Workspace',
      demo_title: 'Lehrer-Demo-Workspace',
      demo_desc: 'Schreibe Python wie deine Schüler. Weise dir selbst Programme für Demos zu — das System behandelt dich wie einen normalen Schüler.',
      demo_launch_btn: 'Demo-Workspace öffnen',
      help_title: 'Aktive Hilfeanfragen',
      help_empty: 'Keine aktiven Anfragen. Gut gemacht!',
      help_join: 'Arbeitsbereich beitreten',
      help_dismiss: 'Schlie\u00dfen',
      roster_title: 'Klassenliste',
      roster_view: 'Ansehen',
      roster_needs_help: 'Braucht Hilfe',
      roster_empty: 'Noch keine Sch\u00fcler.',
      students_title: 'Sch\u00fclerkonten',
      students_desc:
        'Sch\u00fclerkonten mit PIN erstellen und verwalten',
      students_create_btn: 'Sch\u00fcler erstellen',
      students_new_section: 'Neuer Sch\u00fcler',
      students_name_placeholder: 'Sch\u00fclername',
      students_creating: 'Erstelle\u2026',
      students_pin_label: 'PIN:',
      students_account_created: 'Konto erstellt!',
      students_pin_hint: 'Gib diesen PIN an {{name}} weiter:',
      students_pin_note:
        'Der PIN ist auch immer auf der Sch\u00fclerkarte unten sichtbar.',
      students_created_ago: 'Erstellt vor {{time}}',
      students_paused: 'Pausiert',
      students_active: 'Aktiv',
      students_resume: 'Fortsetzen',
      students_pause: 'Pausieren',
      students_delete_confirm:
        'Diesen Sch\u00fcler und alle seine Arbeiten dauerhaft l\u00f6schen?',
      students_empty: 'Noch keine Sch\u00fclerkonten',
      students_empty_desc:
        'Erstelle Konten f\u00fcr deine Sch\u00fcler, damit sie sich mit Name und PIN anmelden k\u00f6nnen.',
      students_create_first: 'Ersten Sch\u00fcler erstellen',
      credits_label: 'Guthaben',
      credits_reset_title: 'Guthaben auf 10 zur\u00fccksetzen',
      programs_title: 'Programmbibliothek',
      programs_desc: 'Programme erstellen und Sch\u00fclern zuweisen',
      programs_load_demos: 'Demos laden',
      programs_loading: 'L\u00e4dt\u2026',
      programs_new: 'Neues Programm',
      programs_empty: 'Noch keine Programme',
      programs_empty_desc:
        'Erstelle Programme mit dem Button oben. Dann den Sch\u00fclern zuweisen.',
      programs_assign: 'Zuweisen',
      programs_no_students: 'Noch keine Sch\u00fcler',
      programs_uploaded_ago: 'Hochgeladen vor {{time}}',
      programs_dialog_title: 'Neues Programm',
      programs_dialog_desc:
        'Gib einen Dateinamen ein und schreibe oder f\u00fcge deinen Python-Code ein.',
      programs_filename_label: 'Dateiname',
      programs_filename_placeholder: 'z.B. hallo_welt',
      programs_filename_hint:
        '.py wird automatisch hinzugef\u00fcgt, wenn weggelassen',
      programs_code_label: 'Code',
      programs_saving: 'Speichern\u2026',
      programs_save: 'Programm speichern',
      prompts_title: 'Prompt-Bibliothek',
      prompts_desc:
        'Prompts erstellen und Sch\u00fclern f\u00fcr den KI-Chat-Modus zuweisen',
      prompts_new: 'Neuer Prompt',
      prompts_empty: 'Noch keine Prompts',
      prompts_empty_desc:
        'Erstelle Prompts mit dem Button oben. Weise sie Sch\u00fclern zu.',
      prompts_dialog_title: 'Neuer Prompt',
      prompts_dialog_desc:
        'Erstelle eine Prompt-Vorlage, die Sch\u00fclern im KI-Chat-Modus zugewiesen werden kann.',
      prompts_title_label: 'Titel',
      prompts_title_placeholder: 'z.B. Erkl\u00e4re, wie KI funktioniert',
      prompts_content_label: 'Prompt-Inhalt',
      prompts_content_placeholder:
        'Schreibe den Prompttext, der an die KI gesendet wird\u2026',
      prompts_saving: 'Speichern\u2026',
      prompts_save: 'Prompt speichern',
      sheets_title: 'Spickzettel',
      sheets_desc:
        'Aktive Spickzettel erscheinen als Schaltfl\u00e4chen im Sch\u00fcler-Header',
      sheets_new: 'Neuer Spickzettel',
      sheets_loading: 'L\u00e4dt\u2026',
      sheets_empty:
        'Noch keine Spickzettel. Klicke auf \u201eNeuer Spickzettel\u201c zum Erstellen.',
      sheets_active: 'Aktiv',
      sheets_hidden: 'Ausgeblendet',
      sheets_delete_confirm: 'Diesen Spickzettel l\u00f6schen?',
      sheets_edit_title: 'Spickzettel bearbeiten',
      sheets_new_title: 'Neuer Spickzettel',
      sheets_title_label: 'Titel',
      sheets_order_label: 'Reihenfolge',
      sheets_content_label: 'Inhalt (Markdown)',
      ai_title: 'KI-Konfiguration',
      ai_desc: 'Verhalten des Assistenten steuern',
      ai_mode_label: 'Globaler KI-Modus',
      ai_mode_off: 'AUS (Deaktiviert)',
      ai_mode_suggestion: 'VORSCHLAG (Hinweise & Erkl\u00e4rungen)',
      ai_mode_agent: 'AGENT (Code-\u00c4nderungen + Diffs)',
      ai_mode_chat: 'CHAT (Vollbild-KI-Chat)',
      ai_provider_label: 'Anbieter',
      ai_apikey_label: 'API-Schl\u00fcssel (f\u00fcr {{provider}})',
      ai_apikey_placeholder: 'API-Schl\u00fcssel eingeben\u2026',
      ai_apikey_hint:
        'Schl\u00fcssel direkt eingeben oder ENV:VAR_NAME verwenden. Leer lassen, um den vorhandenen zu behalten.',
      ai_prompt_suggest: 'Systemanweisung (Vorschlags-Modus)',
      ai_prompt_agent: 'Systemanweisung (Agenten-Modus)',
      ai_prompt_chat: 'Systemanweisung (Chat-Modus)',
      ai_prompt_chat_hint:
        'Diese Anweisung wird verwendet, wenn der KI-Chat-Modus aktiv ist. Grenzen f\u00fcr altersgerechte Gespr\u00e4che festlegen.',
      ai_prompt_off: 'Systemanweisung (Aus-Modus-Nachricht)',
      ai_save: 'Konfiguration speichern',
      ai_saving: 'Speichern\u2026',
      ai_tab_suggest: 'Vorschlag',
      ai_tab_agent: 'Agent',
      ai_tab_chat: 'Chat',
      ai_tab_off: 'Aus',
      lib_title: 'PyLearn Bibliotheks-Referenz',
      lib_desc:
        'Wird automatisch in jeden KI-Prompt eingef\u00fcgt \u00b7 pylearn-ref.ts bearbeiten',
      delete_confirm_label: 'L\u00f6schen?',
    },
    workspace: {
      loading: 'L\u00e4dt\u2026',
      session_paused_title: 'Deine Sitzung wurde pausiert',
      session_ended_title: 'Deine Sitzung wurde beendet',
      session_paused_desc:
        'Dein Lehrer hat deinen Zugang pausiert. Heb bitte deine Hand und warte.',
      session_ended_desc:
        'Dein Lehrer hat deine Sitzung beendet. Bitte sprich mit deinem Lehrer.',
      back_to_login: 'Zur\u00fcck zur Anmeldung',
      mode_changed_title: 'Unterrichtsmodus ge\u00e4ndert',
      mode_changed_desc:
        'Dein Lehrer hat die Unterrichtseinstellungen aktualisiert. Bitte melde dich ab und erneut an.',
      output_label: 'Ausgabe',
      running: '\u25cf L\u00e4uft',
      hide_console: 'Konsole ausblenden',
      show_console: 'Konsole anzeigen',
      present: 'Pr\u00e4sentieren',
      exit_present: 'Beenden',
      console_empty_title: 'Konsole ist leer',
      console_empty_desc:
        'Wenn dein Code print() verwendet, erscheint der Text hier.',
      mode_chat: 'Chat-Modus',
      mode_agent: 'Agenten-Modus',
      mode_suggest: 'Vorschlags-Modus',
      teacher_viewing: 'Lehrer schaut zu',
      need_help: 'Hilfe ben\u00f6tigt',
      source_code: 'Quellcode',
      save: 'Speichern',
      stop: 'Stopp',
      run: 'Ausf\u00fchren',
      exit_fullscreen: 'Vollbild beenden',
      fullscreen: 'Vollbild',
    },
    admin_workspace: {
      back: 'Zur\u00fcck',
      viewing: 'Ansicht: {{name}}',
      co_edit: 'Gemeinsam bearbeiten',
      files: 'Dateien',
      source_code: 'Quellcode',
      output: 'Ausgabe',
      read_only: 'NUR LESEN',
      terminal_label: 'Sch\u00fcler-Terminal (nur lesen)',
    },
    ai_panel: {
      title: 'KI-Assistent',
      no_credits_badge: 'Kein Guthaben',
      credits_one: '{{count}} Guthaben',
      credits_other: '{{count}} Guthaben',
      welcome: 'Hallo! Ich bin dein KI-Coding-Assistent.',
      welcome_hint:
        'Bitte mich, Code zu erkl\u00e4ren, Fehler zu finden oder Verbesserungen vorzuschlagen.',
      no_credits_hint:
        'Kein Guthaben mehr \u2013 wende dich an deinen Lehrer',
      placeholder: 'Stell eine Frage\u2026',
      placeholder_no_credits: 'Kein Guthaben mehr',
      copy: 'Kopieren',
      copied: 'Kopiert',
    },
    ai_chat: {
      title: 'KI-Chat',
      no_credits: 'Kein Guthaben mehr',
      credits_one: '{{count}} Guthaben \u00fcbrig',
      credits_other: '{{count}} Guthaben \u00fcbrig',
      new_chat: 'Neuer Chat',
      welcome: 'Hallo! Frag mich alles \u00fcber KI.',
      welcome_hint:
        'Ich helfe dir, k\u00fcnstliche Intelligenz kennenzulernen. Stell Fragen, erkunde Ideen und entdecke, wie KI funktioniert!',
      no_credits_box:
        'Kein Guthaben mehr. Wende dich an deinen Lehrer f\u00fcr mehr Guthaben.',
      placeholder: 'Stell eine Frage\u2026',
      placeholder_no_credits:
        'Kein Guthaben mehr \u2013 wende dich an deinen Lehrer',
      error_no_credits:
        'Kein Guthaben mehr. Wende dich an deinen Lehrer f\u00fcr mehr Guthaben.',
    },
    sidebar: {
      files: 'Dateien',
      prompts: 'Prompts',
      create_file_title: 'Neue Datei erstellen',
      filename_placeholder: 'dateiname.py',
      creating: 'Erstelle\u2026',
      create_btn: 'Erstellen',
      no_prompts: 'Noch keine Prompts.',
      no_prompts_hint: 'Dein Lehrer wird Prompts zuweisen.',
      no_files: 'Noch keine Dateien.',
      delete_title: 'Datei l\u00f6schen',
      delete_cannot_undo: 'Dies kann nicht r\u00fckg\u00e4ngig gemacht werden.',
      delete_image_confirm: '{{filename}} l\u00f6schen?',
      images: 'Bilder',
      no_images: 'Noch keine Bilder.',
      upload_success: 'Hochgeladen!',
      upload_success_desc: '{{filename}} ist bereit.',
      upload_fail: 'Upload fehlgeschlagen',
      network_error: 'Netzwerkfehler',
      deleted: 'Gel\u00f6scht',
      deleted_desc: '{{filename}} entfernt.',
    },
    not_found: {
      title: '404 Seite nicht gefunden',
      hint: 'Hast du vergessen, die Seite zum Router hinzuzuf\u00fcgen?',
    },
  },
} as const;

type Translations = typeof translations.en;
type Section = keyof Translations;

function interp(str: string, vars?: Record<string, string | number>): string {
  if (!vars) return str;
  return Object.entries(vars).reduce(
    (s, [k, v]) => s.replace(new RegExp(`\\{\\{${k}\\}\\}`, 'g'), String(v)),
    str,
  );
}

export function useTranslation() {
  const dict = translations[lang] as unknown as Record<
    string,
    Record<string, string>
  >;
  const fallback = translations.en as unknown as Record<
    string,
    Record<string, string>
  >;

  function t(
    key: string,
    vars?: Record<string, string | number>,
  ): string {
    const dot = key.indexOf('.');
    if (dot === -1) return key;
    const section = key.slice(0, dot);
    const subkey = key.slice(dot + 1);
    const str =
      dict[section]?.[subkey] ?? fallback[section]?.[subkey] ?? key;
    return interp(str, vars);
  }

  return { t, lang };
}

// Convenience: credits string with built-in pluralisation
export function creditsText(
  t: ReturnType<typeof useTranslation>['t'],
  section: Section,
  count: number,
): string {
  const key = count === 1 ? 'credits_one' : 'credits_other';
  return t(`${section}.${key}`, { count });
}
