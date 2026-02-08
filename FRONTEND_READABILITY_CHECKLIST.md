# Frontend Readability Checklist

Статус:
- [x] Шаг 1: Quality gates (lint/typecheck/test/build)
- [ ] Шаг 2: Разделение `App.tsx` на хуки/секции (частично выполнено: history + uiPrefs + dockLayout)
- [ ] Шаг 3: Разделение `CanvasPlanner` на interaction/controller и renderer
- [ ] Шаг 4: Унификация типов и контрактов данных
- [ ] Шаг 5: Упрощение состояния через reducer/action model
- [ ] Шаг 6: Расширение тестов по рисковым зонам
- [ ] Шаг 7: Техдолг после рефакторинга (Sass warning, магические числа)

## Шаг 1: Quality gates
- [x] Добавить ESLint конфиг для TS + React hooks + import order
- [x] Добавить Prettier и базовый конфиг форматирования
- [x] Добавить npm-скрипты: `lint`, `typecheck`, `format`, `format:check`, `check`
- [x] Проверить, что `npm run check` проходит

## Шаг 2: Разделение `App.tsx`
- [x] Вынести undo/redo + history merge в `useHistory`
- [x] Вынести чтение/сохранение UI-настроек в `useUiPrefs` + `usePersistUiPrefs`
- [x] Вынести dock/layout панелей в `useDockLayout`
- [x] Вынести крупные секции SidePanel в компоненты (`MainSidePanelContent`, `HistoryPanel`)
- [x] Упростить `App.tsx`: удалить refs/effects истории из компонента
- [x] Сохранить существующее поведение (`recordHistory`, `undo`, `redo`, `jump`)
- [x] Проверить сборку и тесты после выноса

## Шаг 3: CanvasPlanner decomposition
- [ ] Вынести pointer/keyboard/wheel interactions в отдельный хук
- [ ] Вынести canvas draw-пайплайн в renderer-модуль
- [ ] Убрать дубли расчетов inner metrics с `App.tsx`

## Шаг 4: Типы и контракты
- [ ] Перевести `constants.js` -> `constants.ts`
- [ ] Перевести `StatsBar.jsx` -> `StatsBar.tsx` (или удалить, если не используется)
- [ ] Оставить единый `Vec2` в одном месте
- [ ] Добавить runtime-валидацию импортируемых данных

## Шаг 5: Управление состоянием
- [ ] Подготовить action map операций редактирования
- [ ] Перевести core-state на `useReducer`
- [ ] Свести побочные эффекты к узким точкам

## Шаг 6: Тесты
- [ ] Добавить unit-тесты для `serialization`
- [ ] Добавить unit-тесты для `geometry`
- [ ] Добавить тесты для history/undo/redo
- [ ] Добавить UI-сценарии (selection/context)

## Шаг 7: Техдолг
- [ ] Убрать Sass legacy JS API предупреждения
- [ ] Вынести thresholds и лимиты в единый config
