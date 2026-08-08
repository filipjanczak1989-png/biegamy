-- share-cards przyjmuje JPEG, nie PNG.
--
-- Bucket miał `allowed_mime_types = {image/png}` z czasów, gdy karty były PNG-ami. Po zmianie
-- formatu upload zaczął odbijać się od bucketu, a EF zwracał 500 „zapis karty padł" — render
-- działał, przewracał się dopiero zapis. Objaw myli, bo wygląda na błąd generatora.
--
-- ⚠️ POWRÓT DO PNG WYMAGA ZMIANY TAKŻE TEJ LINII. Lista jest celowo jednoelementowa, a nie
-- {image/png, image/jpeg}: bucket ma trzymać jeden format, żeby niezmienne klucze nie zaczęły
-- oznaczać raz jednego, raz drugiego. Gdyby kiedyś wracać na PNG — najpierw ta migracja.
UPDATE storage.buckets
   SET allowed_mime_types = ARRAY['image/jpeg']
 WHERE id = 'share-cards';
