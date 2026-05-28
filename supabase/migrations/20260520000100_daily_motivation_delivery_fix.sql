insert into public.admin_settings (key, value_json)
values (
  'daily_motivation_schedule',
  jsonb_build_object(
    'hour_ny', 8,
    'minute_ny', 30,
    'label', '8:30 AM ET',
    'label_24', '08:30 ET'
  )
)
on conflict (key) do update
set
  value_json = excluded.value_json,
  updated_at = now();

insert into public.motivational_messages (
  slug,
  locale,
  title,
  body,
  weekday,
  delivery_hour_ny,
  push_enabled,
  inapp_enabled,
  active
)
values
  (
    'motivation-en-weekday',
    'en',
    'Neuro Trader Journal',
    'Before the market takes your attention, decide who you are today: patient, selective, and disciplined.',
    null,
    8,
    true,
    true,
    true
  ),
  (
    'motivation-es-weekday',
    'es',
    'Neuro Trader Journal',
    'Antes de que el mercado tome tu atencion, decide quien eres hoy: paciente, selectivo y disciplinado.',
    null,
    8,
    true,
    true,
    true
  ),
  (
    'motivation-en-monday',
    'en',
    'Neuro Trader Journal',
    'Monday is not for proving yourself. It is for setting the standard you will protect all week.',
    'mon',
    8,
    true,
    true,
    true
  ),
  (
    'motivation-es-monday',
    'es',
    'Neuro Trader Journal',
    'El lunes no es para probarte. Es para establecer el estandar que vas a proteger toda la semana.',
    'mon',
    8,
    true,
    true,
    true
  ),
  (
    'motivation-en-tuesday',
    'en',
    'Neuro Trader Journal',
    'Your edge is not the trade you want. Your edge is the rule you still obey when pressure rises.',
    'tue',
    8,
    true,
    true,
    true
  ),
  (
    'motivation-es-tuesday',
    'es',
    'Neuro Trader Journal',
    'Tu ventaja no es el trade que quieres. Tu ventaja es la regla que obedeces cuando sube la presion.',
    'tue',
    8,
    true,
    true,
    true
  ),
  (
    'motivation-en-wednesday',
    'en',
    'Neuro Trader Journal',
    'A clean no-trade day beats a messy green day. Protect your process before you chase results.',
    'wed',
    8,
    true,
    true,
    true
  ),
  (
    'motivation-es-wednesday',
    'es',
    'Neuro Trader Journal',
    'Un dia limpio sin trades vale mas que un dia verde y desordenado. Protege tu proceso antes del resultado.',
    'wed',
    8,
    true,
    true,
    true
  ),
  (
    'motivation-en-thursday',
    'en',
    'Neuro Trader Journal',
    'Do not donate your week back to the market. Size down, slow down, and make your plan earn your click.',
    'thu',
    8,
    true,
    true,
    true
  ),
  (
    'motivation-es-thursday',
    'es',
    'Neuro Trader Journal',
    'No le devuelvas tu semana al mercado. Baja tamano, baja velocidad y deja que tu plan se gane cada click.',
    'thu',
    8,
    true,
    true,
    true
  ),
  (
    'motivation-en-friday',
    'en',
    'Neuro Trader Journal',
    'Friday discipline is paid twice: once in capital, once in confidence for next week.',
    'fri',
    8,
    true,
    true,
    true
  ),
  (
    'motivation-es-friday',
    'es',
    'Neuro Trader Journal',
    'La disciplina del viernes se cobra doble: en capital y en confianza para la proxima semana.',
    'fri',
    8,
    true,
    true,
    true
  ),
  (
    'motivation-en-saturday',
    'en',
    'Neuro Trader Journal',
    'Recovery is part of performance. Let the market stay closed inside your mind today.',
    'sat',
    8,
    true,
    true,
    true
  ),
  (
    'motivation-es-saturday',
    'es',
    'Neuro Trader Journal',
    'Recuperarte es parte del rendimiento. Deja que el mercado tambien cierre dentro de tu mente hoy.',
    'sat',
    8,
    true,
    true,
    true
  ),
  (
    'motivation-en-sunday',
    'en',
    'Neuro Trader Journal',
    'Sunday clarity becomes Monday discipline. Review your rules before the market asks who is in control.',
    'sun',
    8,
    true,
    true,
    true
  ),
  (
    'motivation-es-sunday',
    'es',
    'Neuro Trader Journal',
    'La claridad del domingo se convierte en disciplina el lunes. Revisa tus reglas antes de que el mercado pregunte quien manda.',
    'sun',
    8,
    true,
    true,
    true
  )
on conflict (slug) do update
set
  title = excluded.title,
  body = excluded.body,
  weekday = excluded.weekday,
  delivery_hour_ny = excluded.delivery_hour_ny,
  push_enabled = excluded.push_enabled,
  inapp_enabled = excluded.inapp_enabled,
  active = excluded.active,
  updated_at = now();
