namespace NimbusMarkdown;

using System.Threading;
using System.Threading.Tasks;
using Microsoft.VisualStudio.Extensibility;
using Microsoft.VisualStudio.Extensibility.Commands;
using Microsoft.VisualStudio.Extensibility.Shell;

/// <summary>
/// Tools menu command, the first feature slot of the extension.
/// </summary>
[VisualStudioContribution]
public class AboutCommand : Command
{
    /// <inheritdoc />
    public override CommandConfiguration CommandConfiguration => new("%NimbusMarkdown.AboutCommand.DisplayName%")
    {
        TooltipText = "%NimbusMarkdown.AboutCommand.ToolTip%",
        Placements = [CommandPlacement.KnownPlacements.ToolsMenu],
    };

    /// <inheritdoc />
    public override async Task ExecuteCommandAsync(IClientContext context, CancellationToken cancellationToken)
    {
        await this.Extensibility.Shell().ShowPromptAsync(
            "Nimbus Markdown https://github.com/dvgamerr-app/nimbus-markdown",
            PromptOptions.OK,
            cancellationToken);
    }
}
