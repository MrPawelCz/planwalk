<h1 align="center">planwalk</h1>
<p align="center"><b>Zamień rzut mieszkania w trójwymiarowe mieszkanie, po którym możesz się przejść.</b></p>
<p align="center">Wysyłasz zdjęcie rzutu do czatu z AI (sztuczną inteligencją), który czyta obrazy, dostajesz krótki tekst w formacie JSON i wklejasz go na stronie planwalk.<br>Makieta, rozsunięte piętra, spacer po mieszkaniu, eksport do pliku 3D (GLB).<br>Bez konta i bez instalacji. Sam planwalk niczego nie wysyła.</p>

<p align="center">English: <a href="README.md">README.md</a></p>

<p align="center"><img src="docs/demo.gif" alt="Dwupoziomowy dom jako makieta z teksturowanymi meblami, piętra rozsuwają się, potem spacer od przedpokoju po schodach na górę" width="560"></p>

<p align="center"><a href="https://mrpawelcz.github.io/planwalk/pl/">Otwórz aplikację po polsku</a> · <a href="docs/PROMPT.pl.md">Polecenie (prompt) po polsku</a> · <a href="docs/FAQ.pl.md">Pytania i odpowiedzi</a> · <a href="docs/SPEC.md">Format (po angielsku)</a></p>

---

## Czym jest planwalk

planwalk pokazuje rzut jako model 3D, po którym można chodzić. Rysunek (obraz, PDF, szkic, zdjęcie kartki) czyta czat z AI, a nie sam planwalk. Wynikiem jest krótki tekst w formacie JSON (zapis planu: ściany, drzwi, pokoje i wymiary): AI go pisze, Ty możesz go przeczytać i poprawić, a walidator, czyli wbudowana kontrola planu, sprawdza, czy ściany się schodzą, drzwi mieszczą się w ścianach i czy skala jest wiarygodna.

Czym planwalk nie jest: nie jest pomiarem, projektem ani dokumentem do pozwolenia na budowę. To wizualizacja rysunku, który mu dasz.

## Twoje mieszkanie w 3D: trzy kroki

1. Otwórz [stronę planwalk po polsku](https://mrpawelcz.github.io/planwalk/pl/). Możesz też pobrać plik `planwalk.html` z [najnowszego wydania](https://github.com/MrPawelCz/planwalk/releases/latest) i otworzyć go dwukrotnym kliknięciem: działa bez internetu.
2. Wyślij do czatu z AI, który czyta obrazy, zdjęcie swojego rzutu razem z poleceniem (promptem); zdjęcie dodasz zwykle przyciskiem ze spinaczem albo plusem przy polu do pisania. Najprościej: na stronie planwalk kliknij „Kopiuj polecenie” (przycisk jest na karcie „To jest przykład” i w oknie „Jak działa planwalk”, które otwiera przycisk „Pomoc”) i wklej do rozmowy. Ten sam tekst jest w pliku [`docs/PROMPT.pl.md`](docs/PROMPT.pl.md). Przed wysłaniem zasłoń lub przytnij imiona, adresy i numery telefonu widoczne na rysunku. Polecenie jest przygotowane dla czatów, które czytają obrazy. Angielską wersję polecenia sprawdzono na modelach z tabeli „Runs by model” w [`docs/BENCHMARK.md`](docs/BENCHMARK.md) (po angielsku; obecną wersję na wszystkich 12 planach dla Claude Sonnet 5.5 i Claude Haiku 4.5, a dla gpt-6-astra na 7 z 12); polskiej wersji ani polskich rysunków nie mierzono. Inne czaty, które czytają obrazy, powinny działać, ale to oczekiwanie, a nie wynik (wyniki są mile widziane).
3. Wklej odpowiedź czatu na stronie: kliknij „Wklej odpowiedź”, wklej tekst w okno i kliknij „Wczytaj” (cały tekst odpowiedzi wystarczy, planwalk sam znajdzie w nim plan). Zapisany plik `.json` otworzysz przyciskiem „Otwórz plik” w tym samym oknie albo, na komputerze, upuszczając go na stronę. Jeśli planwalk zgłosi problemy (panel „Problemy”), kliknij „Kopiuj prośbę o poprawkę”, wklej to do tej samej rozmowy i wczytaj poprawioną odpowiedź. Powtarzaj, aż się otworzy. Plan z kilkoma błędami też się otworzy: nieznana właściwość jest pomijana, a element, którego nie da się odczytać (na przykład drzwi lub okno o szerokości 0), jest pomijany, o czym informuje komunikat z listą pominiętych elementów. Dopiero gdy nie zostaje nic użytecznego, nowy model się nie zbuduje, a poprzedni zostaje na ekranie.

Chcesz tylko się rozejrzeć? Wybierz przykład z listy „Przykłady” (na telefonie jest w „Menu”): jest mieszkanie z jedną sypialnią i dom z dwoma piętrami i schodami.

## Co dostajesz

- **Makieta** i swobodne obracanie (przyciski „Makieta” i „Obrót”) z niskimi ścianami (pole „Niskie ściany”) oraz nazwami i powierzchniami pomieszczeń (pole „Nazwy pokoi”; powierzchnia z rysunku, a gdy jej brak, szacunek bez grubości ścian, oznaczony znakiem ~), **rozsunięte piętra** (suwak „Rozsuń piętra”) i widok „Z góry”. Na telefonie w pionie cztery tryby są na dolnym pasku, a pozostałe przyciski w „Menu”
- **Spacer** (przycisk „Spacer”), w którym nie przejdziesz przez ściany, ale przejdziesz przez drzwi i wejdziesz schodami na inne piętro; jest też minimapa. Na telefonie przeciągasz palcem po lewej połowie ekranu, żeby iść, a po prawej, żeby się rozglądać
- **Dwa wyglądy**: tekstury tworzone w kodzie (podłogi, tynk, tkaniny; bez plików z obrazkami; pole „Tekstury”) albo jednolite kolory (odznacz „Tekstury” albo dodaj do adresu `?materials=clay`)
- **Eksport i udostępnianie**: „Pobierz model 3D (GLB)” (plik GLB, czyli model 3D do otwarcia w innych programach), „Pobierz obraz (PNG)”, **link z planem w środku** („Kopiuj link”: plan jest zapisany w samym linku, więc odczyta go każdy, kto dostanie link, także aplikacja, przez którą go wyślesz; link skopiowany z pobranego pliku prowadzi do strony na żywo, więc do otwarcia potrzebne jest połączenie z internetem; krótki link wymaga Safari 16.4, Chrome 103 lub Firefoksa 113, w starszych przeglądarkach użyj „Kopiuj długi link”), „Udostępnij obraz” (obraz widoku, który masz na ekranie) oraz **samodzielny plik HTML** z Twoim planem w środku, do otwarcia na komputerze („Pobierz jako plik HTML”)
- **Walidator**, który opisuje każdy znaleziony błąd tak, żeby czat mógł go poprawić (łapie błędy w geometrii planu, ale nie to, że plan różni się od rysunku). Okno „O tym modelu” (przycisk „O modelu”) pokazuje liczbę pięter i pomieszczeń, powierzchnię, skalę, uwagi z odczytu rysunku i ostrzeżenia z kontroli planu
- **Język**: strona wybiera polski albo angielski według przeglądarki; przełącznik PL | EN jest w oknie „Pomoc”, a `?lang=pl` lub `?lang=en` w adresie wymusza język

## Prywatność

Sam planwalk niczego nie wysyła: strona nie ma kont, kluczy API, statystyk ani ciasteczek i niczego nie zapisuje w przeglądarce. Twój plan zostaje na urządzeniu. Jedyny wyjątek to opcjonalny parametr adresu `?plan=<adres>`, który pobiera plan z podanego adresu (Twoje dane nie są przy tym nigdzie wysyłane). Zdjęcie rzutu trafia tylko do czatu z AI, który wybierzesz, więc dla bezpieczeństwa zasłoń na nim dane osobowe.

## Granice

- Jakość odczytu zależy od modelu i od rysunku. Najlepiej działają czyste rysunki CAD z wpisanymi wymiarami; szkic bez żadnej skali to zgadywanie. Okno „O tym modelu” pokazuje notatkę o skali, którą zostawił czytający rysunek, a plakietka „Skala szacowana” pojawia się, gdy ta notatka mówi, że skala jest przybliżona. Sam planwalk niczego nie mierzy: walidator sprawdza tylko, czy rozmiar jest wiarygodny i czy podane powierzchnie pomieszczeń pasują do wielokątów.
- Testy na prostych planach syntetycznych pokazały, że cały proces działa. Nie dowodzą, że prawdziwe rzuty są czytane równie dobrze, bo prawdziwych rysunków jeszcze nie mierzono. Szczegóły i ograniczenia testów są w [`docs/BENCHMARK.md`](docs/BENCHMARK.md) (po angielsku).
- Tylko proste biegi schodowe; na rysunku jednej kondygnacji są pokazane jako stopnie, które nigdzie nie prowadzą. Bez dachów, terenu i otoczenia. Meble to tylko dekoracja.
- To wizualizacja Twojego rysunku, nie pomiar. Sprawdź wymiary, zanim na nich zaczniesz polegać, i nie używaj modelu do pozwoleń ani do budowy.

## Dla agentów i programistów

Dla agentów AI, które wczytują foldery z umiejętnościami (skills), jest folder [`skill/planwalk`](skill/planwalk) (czyta rysunek, waliduje plik i buduje stronę). Narzędzia wiersza poleceń, format pliku i instrukcje dla współtwórców opisuje [README po angielsku](README.md).

## Autor

Paweł Czerwiński ([@MrPawelCz](https://github.com/MrPawelCz)).

## Licencja

MIT, zobacz [`LICENSE`](LICENSE). Licencje składników zewnętrznych: [`THIRD_PARTY_LICENSES.md`](THIRD_PARTY_LICENSES.md). Przykładowe plany są na licencji CC0.
