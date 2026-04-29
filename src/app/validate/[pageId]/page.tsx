import IntegratedValidationConsole from "@/components/integrated-validation-console";

type ValidatePageProps = {
  params: Promise<{
    pageId: string;
  }>;
};

export default async function ValidatePage({ params }: ValidatePageProps) {
  const { pageId } = await params;
  return <IntegratedValidationConsole pageId={pageId} />;
}
