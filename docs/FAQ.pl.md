# Pytania i odpowiedzi

Najczęstsze pytania po polsku. Dłuższa lista jest po angielsku w [`FAQ.md`](FAQ.md), a opis projektu w [`README.pl.md`](../README.pl.md).

**Czy mój plan gdzieś trafia?** planwalk niczego nie wysyła, a sama strona po załadowaniu nie łączy się z internetem; jedyny wyjątek to opcjonalny parametr adresu `?plan=<adres>`, który pobiera plan z podanego adresu. Zdjęcie rzutu trafia tylko do czatu AI, który sam wybierasz, więc najpierw zasłoń na rysunku imiona, adresy i numery telefonów (wystarczy przyciąć obraz).

**Jakiej AI potrzebuję?** Takiej, która czyta obrazy i potrafi napisać JSON. Przetestowany jest dotąd tylko Claude Sonnet 5.5, na 12 planach syntetycznych (lista przetestowanych modeli jest w [`BENCHMARK.md`](BENCHMARK.md), po angielsku). Inne czaty, które czytają obrazy, powinny działać, ale to oczekiwanie, a nie wynik. Prompt dla polskich rysunków jest w [`PROMPT.pl.md`](PROMPT.pl.md).

**Jak dokładny jest odczyt rysunku?** Zależy od modelu i od rysunku. Na razie jest tylko prosty test, czy całość w ogóle działa: plany syntetyczne ze znanym wzorcem, w czterech stylach rysunku. Claude Sonnet 5.5 dostał średnio 99,6 punktu na 100, ale te plany są łatwe, a czytający znał narzędzia testu, więc to dowód, że całość działa, a nie że prawdziwe rzuty są czytane tak dobrze. Prawdziwych rysunków jeszcze nie mierzono. Gorzej spodziewaj się przy szkicach bez skali, skanach i zagraconych rysunkach. Walidator łapie błędy w geometrii planu, a nie pomyłki w odczycie, dlatego zawsze porównaj wynik z rysunkiem.

**Wynik wygląda źle. Co mogę zrobić?** Przytnij obraz do rzutu razem z tabelą pomieszczeń (jeśli jest), a tabliczkę rysunkową z imionami i adresem zasłoń lub usuń. Jeśli rysunek jest zagracony, wysyłaj po jednej kondygnacji na obraz. Jeśli strona wypisze problemy, kliknij „Copy fix request” i wklej to do tej samej rozmowy. Jeśli ściany się nie schodzą albo pokoje wychodzą za duże, napisz w czacie: „Prowadź ściany po osi grubych pasów i niech spotykają się we wspólnych punktach narożnych”. Porównaj wynik z rysunkiem: planwalk pokazuje to, co jest w pliku JSON, a nie to, co rysunek miał na myśli.

**Czy mogę użyć tego w ogłoszeniu o nieruchomości?** Tak, jako wizualizację poglądową: planwalk pokazuje rysunek, który mu dasz, i nie jest pomiarem. Napisz o tym w ogłoszeniu, a powierzchnie podawaj z dokumentów (na przykład z karty lokalu), a nie z modelu. Nie używaj go do pozwoleń ani do budowy.
