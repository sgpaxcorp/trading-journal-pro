# Billing y planes
## Acceso
- Desde la navegación lateral, abre `Billing`.
- También puedes llegar desde ajustes de cuenta, avisos de upgrade, comparación de planes y pantallas posteriores al checkout.

Billing se gestiona en la web. La app móvil no crea cuentas, no cambia suscripciones y no gestiona add-ons.

## Qué puedes hacer aquí
1. Subir o bajar entre `Core` y `Advanced`.
2. Cambiar entre facturación mensual y anual.
3. Agregar o quitar add-ons soportados como `Broker Sync`.
4. Revisar estado de la suscripción, próxima renovación y ciclo de pago.
5. Encender o apagar la auto-renovación.
6. Programar la cancelación de la suscripción.
7. Abrir el historial de pagos.

## Estado de Option Flow
`Option Flow Intelligence` está actualmente en beta privada. No está disponible para compra pública ni activación self-service desde Billing.

## Cancelación de suscripción
### Dónde cancelar
1. Abre `Billing`.
2. Baja hasta `Subscription settings`.
3. Busca la sección `Auto-renew & cancellation`.
4. Haz clic en `Open cancellation flow`.

### Qué ve el usuario antes de cancelar
- Estado actual de la suscripción.
- Próxima fecha del ciclo de pago.
- Fecha hasta la que el acceso sigue activo.
- Un recordatorio de que cancelar hoy solo detiene la próxima renovación.
- Un recordatorio de que esta acción no emite un reembolso automático salvo que la ley lo exija o se apruebe por separado.

### Paso 1: Encuesta de salida
El modal de cancelación empieza con una encuesta. Se le pide al usuario:
1. Motivo principal de cancelación.
2. Cuánto usó la plataforma.
3. Qué sintió que faltaba o qué fue difícil.
4. Qué lo haría volver.
5. Cualquier comentario adicional por escrito.

Las primeras dos respuestas son obligatorias antes de pasar a la revisión final.

### Paso 2: Revisión final
Antes de confirmar la cancelación, el modal muestra:
1. La próxima fecha del ciclo de pago.
2. La fecha exacta hasta la que la membresía sigue activa.
3. La regla de que cancelar hoy solo detiene la renovación futura.
4. La regla de que esta acción no emite un reembolso automático.
5. Un checkbox de confirmación que el usuario debe aceptar.

La cancelación solo se envía cuando el usuario hace clic en `Confirm cancellation`.

### Después de cancelar
Cuando la cancelación se acepta:
1. La auto-renovación se apaga.
2. La membresía sigue activa hasta que termine el período actual.
3. La plataforma muestra un aviso de confirmación con la fecha final de acceso.
4. El usuario recibe un email de cancelación de NeuroTrader Journal.
5. Las respuestas de la encuesta se guardan para revisión interna.
6. Se programa un seguimiento de winback para 30 días después.

### Reglas importantes de billing
- Cancelar no elimina el acceso inmediatamente.
- Cancelar no anula el período ya pagado.
- Si el usuario pagó recientemente, el acceso sigue activo hasta la próxima fecha del ciclo mostrada en Billing.
- El flujo de cancelación solo detiene renovaciones futuras.
- Los reembolsos no son automáticos en este flujo.

## Historial de pagos
Abre `Billing History` para revisar facturas anteriores y períodos de pago.

## Mejores prácticas
- Revisa la próxima fecha de renovación antes de cambiar la auto-renovación.
- Usa facturación anual solo si coincide con tu horizonte real de trading.
- Cancela desde Billing en vez de quitar el método de pago externamente, para que las fechas de acceso y los emails de confirmación sigan correctos.
