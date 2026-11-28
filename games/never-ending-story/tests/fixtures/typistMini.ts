/** Mini lesson file for tests (original text) in the same shape as a published gtypist course. */
export const MINI_TYP = `# Mini lesson file for tests (original text) in the same shape as a published gtypist course:
# a menu, banners, instructions, speed tests, a Q:/N: prompt, and a final G: goto.
*:MENU
B:Mini Quotes Course
M:"The mini course has these lessons"
 :ONE      "First lesson         Two short quotes"
 :TWO      "Second lesson        One drill, one tutorial"
 :EMPTY    "Empty lesson         Nothing to type"

*:ONE
B:First lesson banner

*:ONE_1
I:[1] Ada Example, a note
S:Programs should be small, and then
 :they should be smaller still.

*:ONE_2
I:[2] Bob Sample
S:It’s “fine” — really…  A  tab	here.
 :
 :Second paragraph after a blank line.
Q:Do you want to continue to next lesson [Y/N] ?
Y:TWO
N:MENU

*:TWO
B:Second lesson banner
T:A tutorial paragraph
 :split over two lines.
K:12:Rewind
E:5%

*:TWO_1
I:Drill one
D:asdf jkl;
 :fjdk slaj
X:

*:TWO_2
I:Lower case drill and an empty one
d:the quick brown fox
D:
Z:mystery command

*:EMPTY
B:Nothing here
G:MENU
`;
