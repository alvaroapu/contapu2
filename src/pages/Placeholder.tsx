import { Card, CardContent } from '@/components/ui/card';

export default function Placeholder({ title }: { title: string }) {
  return (
    <div>
      <h1 className="mb-4 text-2xl font-bold">{title}</h1>
      <Card>
        <CardContent className="flex items-center justify-center py-16 text-muted-foreground">
          Próximamente
        </CardContent>
      </Card>
    </div>
  );
}
