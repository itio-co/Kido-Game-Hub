/** Original sample lessons in gtypist format. Written for this game; also the offline fallback for Typist lessons. */
export const SAMPLE_TYP = `# Sample lessons for the Typist lessons sub-game (original text).
*:MENU
B:Sample course
M:"Sample lessons"
 :KEYS      "Key drills          Short drills on the home row and common pairs"
 :TIPS      "Programming tips    Short sentences about writing code"

*:KEYS
B:Key drills
T:Rest your fingers on the home row and type each line without looking down.
 :Speed matters less than getting every character right.

*:K_1
I:Home row
D:asdf jkl; asdf jkl; fjdk slaj
 :fall flask salad dad had a lad

*:K_2
I:Common pairs
d:th he in er an re on at en nd
 :the then than there their other

*:K_3
I:Numbers and symbols
D:1 + 2 = 3; 10 - 4 = 6; (a, b) => a * b
Q:Do you want to continue to next lesson [Y/N] ?
N:MENU

*:TIPS
B:Programming tips

*:P_1
I:[1] Keep names clear
S:Name things for what they do, so the next reader does not have to guess.

*:P_2
I:[2] Small steps
S:Make a small change, run the tests, and only then make the next change.
 :
 :If something breaks, you know exactly where to look.

*:P_3
I:[3] Read the error
s:Read the whole error message first; it usually names the line and the cause.

G:MENU
`;
