namespace NimbusMarkdown;

using Microsoft.Extensions.DependencyInjection;
using Microsoft.VisualStudio.Extensibility;

/// <summary>
/// Extension entry point for Nimbus Markdown.
/// </summary>
[VisualStudioContribution]
public class NimbusMarkdownExtension : Extension
{
    /// <inheritdoc/>
    public override ExtensionConfiguration ExtensionConfiguration => new()
    {
        Metadata = new(
            id: "NimbusMarkdown.2bcdcd93-d244-49bc-aad9-d758f53c52a7",
            version: this.ExtensionAssemblyVersion,
            publisherName: "dvgamerr",
            displayName: "Nimbus Markdown",
            description: "Nimbus Markdown for Visual Studio."),
    };

    /// <inheritdoc/>
    protected override void InitializeServices(IServiceCollection serviceCollection)
    {
        base.InitializeServices(serviceCollection);
    }
}
