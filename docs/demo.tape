# This tape records the README animation with vhs (https://github.com/charmbracelet/vhs): vhs docs/demo.tape
Output docs/demo.gif
Set Shell "bash"
Set FontSize 14
Set Width 1200
Set Height 820
Set Padding 18
Set Theme "GitHub Dark"
Set TypingSpeed 45ms
Hide
Type "alias wormsign='node dist/cli.js'; export GITHUB_TOKEN=$(gh auth token) PS1='$ ' && clear"
Enter
Show
Type "wormsign ConcordiaDev/theme_saimaniq"
Sleep 400ms
Enter
Sleep 7s
Sleep 4s
Type "echo $?"
Enter
Sleep 3s
