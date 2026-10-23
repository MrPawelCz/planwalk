<h1 align="center">planwalk</h1>
<p align="center"><b>Zamień rzut mieszkania w trójwymiarowe mieszkanie, po którym możesz się przejść.</b></p>
<p align="center">Wysyłasz zdjęcie rzutu do czatu AI, który czyta obrazy, dostajesz mały plik JSON i otwierasz go w jednej stronie HTML.<br>Makieta, rozsunięte piętra, spacer z perspektywy pierwszej osoby, eksport GLB.<br>Bez serwera i bez kluczy API. Sam planwalk niczego nie wysyła.</p>

<p align="center">English: <a href="README.md">README.md</a></p>

<p align="center"><img src="docs/demo.gif" alt="Dwupoziomowy dom jako makieta z teksturowanymi meblami, piętra rozsuwają się, potem spacer od przedpokoju po schodach na górę" width="560"></p>

<p align="center"><a href="https://mrpawelcz.github.io/planwalk/">Otwórz podgląd</a> · <a href="docs/PROMPT.pl.md">Prompt po polsku</a> · <a href="docs/FAQ.pl.md">Pytania i odpowiedzi</a> · <a href="docs/SPEC.md">Format (po angielsku)</a></p>

---

## Czym jest planwalk

planwalk pokazuje rzut jako model 3D, po którym można chodzić. Rysunek (obraz, PDF, szkic, zdjęcie kartki) czyta czat AI, a nie sam planwalk. Wynikiem jest zwykły, krótki plik JSON: AI go pisze, Ty możesz go przeczytać i poprawić, a walidator sprawdza, czy ściany się schodzą, drzwi mieszczą się w ścianach i czy skala jest wiarygodna.

Czym planwalk nie jest: nie jest pomiarem, projektem ani dokumentem do pozwolenia na budowę. To wizualizacja rysunku, który mu dasz.

## Twoje mieszkanie w 3D: trzy kroki

1. Otwórz [stronę planwalk](https://mrpawelcz.github.io/planwalk/). Możesz też pobrać plik `planwalk.html` z [najnowszego wydania](https://github.com/MrPawelCz/planwalk/releases/latest) i otworzyć go dwukrotnym kliknięciem: działa bez internetu.
2. Wyślij do czatu, który czyta obrazy, zdjęcie swojego rzutu razem z promptem z pliku [`docs/PROMPT.pl.md`](docs/PROMPT.pl.md) (skopiuj cały tekst i wklej go do rozmowy). Przed wysłaniem zasłoń lub przytnij imiona, adresy i numery telefonu widoczne na rysunku. Prompt jest przygotowany dla czatów, które czytają obrazy. Wersję angielską mierzono na modelach z tabeli „Runs by model” w [`docs/BENCHMARK.md`](docs/BENCHMARK.md) (po angielsku; Claude Haiku 4.5 tylko z pierwszą wersją promptu, gpt-6-astra z obecną na 7 z 12 planów); polskiego promptu i polskich rysunków jeszcze nie mierzono. Inne czaty, które czytają obrazy, powinny działać, ale to oczekiwanie, a nie wynik (wyniki są mile widziane).
3. Wklej odpowiedź na stronie (przycisk „Paste JSON”; karta pierwszej wizyty, pomoc i komunikaty o wczytywaniu są po polsku, reszta przycisków na razie po angielsku) albo przeciągnij plik `.json` na stronę. Jeśli strona wypisze problemy, kliknij „Copy fix request” (w komunikacie o błędach przycisk nazywa się „Kopiuj prośbę o poprawkę”), wklej to do tej samej rozmowy i wczytaj poprawiony JSON. Powtarzaj, aż się otworzy.

Chcesz tylko się rozejrzeć? Wybierz przykład z menu: jest mieszkanie z jedną sypialnią i dom z dwoma poziomami i schodami.

## Co dostajesz

- **Makieta** z odsłoniętymi ścianami oraz nazwami i powierzchniami pomieszczeń, **rozsunięte piętra**, widok z góry, swobodne obracanie
- **Spacer**, w którym nie przejdziesz przez ściany, ale przejdziesz przez drzwi i wejdziesz schodami na inne piętro; jest też minimapa
- **Dwa wyglądy**: tekstury tworzone w kodzie (podłogi, tynk, tkaniny; bez plików z obrazkami) albo jednolite kolory
- **Eksport**: GLB, zdjęcie PNG oraz **samodzielny plik HTML** z Twoim planem w środku, który możesz komuś wysłać jako jeden plik
- **Walidator**, który opisuje każdy znaleziony błąd tak, żeby czat mógł go poprawić (łapie błędy w geometrii planu, ale nie to, że plan różni się od rysunku)

## Prywatność

Sam planwalk niczego nie wysyła: strona nie ma kont, kluczy API, statystyk ani ciasteczek i niczego nie zapisuje w przeglądarce. Twój plan zostaje na urządzeniu. Jedyny wyjątek to opcjonalny parametr adresu `?plan=<adres>`, który pobiera plan z podanego adresu (Twoje dane nie są przy tym nigdzie wysyłane). Zdjęcie rzutu trafia tylko do czatu AI, który sam wybierasz, więc dla bezpieczeństwa zasłoń na nim dane osobowe.

## Granice

- Jakość odczytu zależy od modelu i od rysunku. Najlepiej działają czyste rysunki CAD z wpisanymi wymiarami; szkic bez żadnej skali to zgadywanie.
- Testy na prostych planach syntetycznych pokazały, że cały potok działa. Nie dowodzą, że prawdziwe rzuty są czytane równie dobrze, bo prawdziwych rysunków jeszcze nie mierzono. Szczegóły i ograniczenia testów są w [`docs/BENCHMARK.md`](docs/BENCHMARK.md) (po angielsku).
- Tylko proste biegi schodowe; na rysunku jednej kondygnacji są pokazane jako stopnie, które nigdzie nie prowadzą. Bez dachów, terenu i otoczenia. Meble to tylko dekoracja.
- To wizualizacja Twojego rysunku, nie pomiar. Sprawdź wymiary, zanim na nich zaczniesz polegać, i nie używaj modelu do pozwoleń ani do budowy.

## Dla agentów i programistów

Dla agentów, które wczytują foldery z umiejętnościami, jest folder [`skill/planwalk`](skill/planwalk) (czyta rysunek, waliduje plik i buduje stronę). Narzędzia wiersza poleceń, format pliku i instrukcje dla współtwórców opisuje [README po angielsku](README.md).

## Autor

Paweł Czerwiński ([@MrPawelCz](https://github.com/MrPawelCz)).

## Licencja

MIT, zobacz [`LICENSE`](LICENSE). Licencje składników zewnętrznych: [`THIRD_PARTY_LICENSES.md`](THIRD_PARTY_LICENSES.md). Przykładowe plany są na licencji CC0.
