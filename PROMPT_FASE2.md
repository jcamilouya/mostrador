# Prompt — Fase 2 Mostrador

Lee el archivo `ROADMAP_UPDATE_V2.md` completo antes de empezar. Es tu guía para todo lo que haremos en esta fase.

## Contexto rápido

La app corre perfecta. Todas las secciones cargan. Ahora vamos a arreglar 3 bugs, completar la página de Configuración, integrar WhatsApp con IA para leer facturas, y agregar 2 features nuevas (Cotizaciones y Catálogo Virtual) para competir con Treinta.

## Cómo vas a trabajar

**Regla de oro:** un checkbox a la vez. Antes de pasar al siguiente, verifica que el anterior funciona. No acumules cambios sin probar.

Para cada tarea:
1. Dime qué vas a hacer en 2 líneas
2. Hazlo
3. Pruébalo
4. Dime qué quedó listo y qué sigue

Si algo no está claro en el roadmap, pregúntame antes de asumir. Si encuentras algo roto que no estaba en la lista, dímelo antes de arreglarlo solo.

## Por dónde empezar

Empieza por los 3 bugs del ROADMAP_UPDATE_V2.md, en este orden exacto:

1. **KPIs en $0** → lógica de fallback a últimos 7 días cuando hoy no tiene datos
2. **-100% vs mes pasado** → ocultar el badge de comparativo cuando no hay datos suficientes
3. **Heatmap desalineado** → fix de coordenadas día/hora en el grid

Los 3 son cambios pequeños pero críticos. Sin esto no le mostramos la app a nadie.

## Tono de la app

Todo el microcopy en español colombiano, informal y humano. El bot de WhatsApp habla como una persona, no como un sistema. Los toasts celebran, los errores son amables. Eso ya lo sabes del ROADMAP original, mantenlo en todo lo que toques.

## Una cosa importante sobre el webhook de WhatsApp

Cuando llegues al paso 9 (webhook GET de Meta), necesitas una URL pública para que Meta pueda verificarlo. Usa ngrok:

```bash
ngrok http 3000
```

Copia la URL que te da (algo como `https://abc123.ngrok.io`) y úsala como webhook URL en el panel de Meta. Dime cuando llegues ahí y te explico el paso a paso de la configuración en Meta si lo necesitas.

Arranca con el bug #1 y dime qué vas a hacer.
